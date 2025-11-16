// 1. 导入
const { neon } = require('@neondatabase/serverless');
const COS = require('cos-nodejs-sdk-v5');

// --- 处理器 1: GET (获取视频列表) ---
// (此代码来自 get-videos.js)
const handleGet = async (req, res, sql) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '5', 10);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;
        const searchPattern = `%${search}%`;

        const videosQuery = sql`
            WITH VideoData AS (
                SELECT 
                    v.id, v.title, v.description, v.cover_key, v.video_key,
                    v.views_count,
                    TO_CHAR(v.upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS upload_date,
                    COALESCE(
                        json_agg(
                            json_build_object('tag_id', t.tag_id, 'tag_name', t.tag_name)
                        ) FILTER (WHERE t.tag_id IS NOT NULL), 
                        '[]'
                    ) AS tags,
                    STRING_AGG(t.tag_name, ', ') AS tag_names
                FROM videos v
                LEFT JOIN video_tags vt ON v.id = vt.video_id
                LEFT JOIN tags t ON vt.tag_id = t.tag_id
                GROUP BY v.id
            ),
            FilteredData AS (
                SELECT *, COUNT(*) OVER() AS total_count
                FROM VideoData
                WHERE title ILIKE ${searchPattern} OR tag_names ILIKE ${searchPattern}
            )
            SELECT * FROM FilteredData
            ORDER BY id DESC
            LIMIT ${limit}
            OFFSET ${offset};
        `;

        const result = await videosQuery;
        const totalCount = result.length > 0 ? parseInt(result[0].total_count, 10) : 0;
        const totalPages = Math.ceil(totalCount / limit);
        result.forEach(r => delete r.total_count);

        res.status(200).json({
            videos: result,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCount: totalCount,
                limit: limit
            }
        });
    } catch (error) {
        console.error('获取视频列表失败:', error);
        res.status(500).json({ error: '数据库查询失败', details: error.message });
    }
};

// --- 处理器 2: POST (创建新视频) ---
// (此代码来自 create-video-record.js, 使用手动事务)
const handleCreate = async (req, res, sql) => {
    const { title, description, tags, coverKey, videoKey } = req.body;

    try {
        if (!title || !coverKey || !videoKey) {
            return res.status(400).json({ error: '缺少 title, coverKey 或 videoKey' });
        }
        
        console.log(`[Create] 收到数据库写入请求: ${title}`);

        await sql`BEGIN`; // 1. 开始事务
        console.log(`(事务) [Create] BEGIN`);

        const videoResult = await sql`
            INSERT INTO videos (title, description, cover_key, video_key)
            VALUES (${title}, ${description}, ${coverKey}, ${videoKey})
            RETURNING id
        `;
        
        const newVideoId = videoResult[0].id;
        console.log(`(事务) [Create] 视频记录创建成功, ID: ${newVideoId}`);

        let tagIds = [];
        if (tags && tags.length > 0) {
            await sql`
                INSERT INTO tags (tag_name)
                SELECT tag_name 
                FROM unnest(${tags}::text[]) AS t(tag_name)
                WHERE NOT EXISTS (
                    SELECT 1 FROM tags t_exists WHERE t_exists.tag_name = t.tag_name
                )
            `;
            const tagResults = await sql`
                SELECT tag_id FROM tags WHERE tag_name = ANY(${tags})
            `;
            tagIds = tagResults.map(t => t.tag_id);
            for (const tagId of tagIds) {
                await sql`
                    INSERT INTO video_tags (video_id, tag_id)
                    VALUES (${newVideoId}, ${tagId})
                    ON CONFLICT (video_id, tag_id) DO NOTHING
                `;
            }
            console.log(`(事务) [Create] 标签关联完成`);
        }
        
        await sql`COMMIT`; // 2. 提交事务
        console.log(`(事务) [Create] COMMIT 成功`);
        
        return res.status(200).json({ 
            message: '数据库记录创建成功', 
            video: { newVideoId, title, tagIds } 
        });

    } catch (error) {
        console.error('数据库事务写入失败 [Create]:', error);
        
        try {
            console.log('(事务) [Create] 正在回滚...');
            await sql`ROLLBACK`;
            console.log('(事务) [Create] 回滚成功');
        } catch (rollbackError) {
            console.error('!! 事务回滚失败 [Create] !!:', rollbackError);
        }
        
        if (error.code === '23505' && error.constraint === 'videos_video_key_key') {
             return res.status(409).json({ error: '数据库写入失败：视频文件 (video_key) 已存在。', details: error.message });
        }
        
        return res.status(500).json({ 
            error: '数据库事务写入失败，数据已回滚', 
            details: error.message || error.toString()
        });
    }
};

// --- 处理器 3: PUT (更新视频) ---
// (此代码来自 update-video.js, 使用手动事务)
const handleUpdate = async (req, res, sql, cos) => {
    try {
        const { 
            videoId, title, description, tags, 
            newCoverKey, newVideoKey,
            oldCoverKey, oldVideoKey 
        } = req.body;

        if (!videoId || !title || oldCoverKey === undefined || oldVideoKey === undefined) {
            return res.status(400).json({ error: '缺少必要参数 (id, title, oldKeys)' });
        }
        
        console.log(`[Update] 收到 ID:${videoId} 的更新请求`);

        const finalCoverKey = newCoverKey || oldCoverKey;
        const finalVideoKey = newVideoKey || oldVideoKey;

        await sql`BEGIN`; // 1. 开始事务
        console.log(`(事务) [Update] BEGIN`);

        await sql`
            UPDATE videos
            SET 
                title = ${title}, description = ${description}, 
                cover_key = ${finalCoverKey}, video_key = ${finalVideoKey},
                upload_date = CURRENT_TIMESTAMP
            WHERE id = ${videoId}
        `;
        console.log(`(事务) [Update] ID:${videoId} videos 表更新成功`);

        await sql`DELETE FROM video_tags WHERE video_id = ${videoId}`;

        if (tags && tags.length > 0) {
            await sql`
                INSERT INTO tags (tag_name)
                SELECT tag_name 
                FROM unnest(${tags}::text[]) AS t(tag_name)
                WHERE NOT EXISTS (
                    SELECT 1 FROM tags t_exists WHERE t_exists.tag_name = t.tag_name
                )
            `;
            const tagResults = await sql`
                SELECT tag_id FROM tags WHERE tag_name = ANY(${tags})
            `;
            const tagIds = tagResults.map(t => t.tag_id);
            for (const tagId of tagIds) {
                await sql`
                    INSERT INTO video_tags (video_id, tag_id)
                    VALUES (${videoId}, ${tagId})
                    ON CONFLICT (video_id, tag_id) DO NOTHING
                `;
            }
        }
        console.log(`(事务) [Update] ID:${videoId} 标签更新成功`);
        
        await sql`COMMIT`; // 2. 提交事务
        console.log(`(事务) [Update] COMMIT 成功`);

        // --- 数据库事务结束 ---

        // 3. 数据库成功后，清理旧的 COS 文件
        let cleanedFiles = [];
        if (newCoverKey && newCoverKey !== oldCoverKey) {
            console.log(`[Update] 准备删除旧封面: ${oldCoverKey}`);
            await cos.deleteObject({ Bucket: 'video-1383328809', Region: 'ap-hongkong', Key: oldCoverKey });
            cleanedFiles.push(oldCoverKey);
        }
        if (newVideoKey && newVideoKey !== oldVideoKey) {
            console.log(`[Update] 准备删除旧视频: ${oldVideoKey}`);
            await cos.deleteObject({ Bucket: 'video-1383328809', Region: 'ap-hongkong', Key: oldVideoKey });
            cleanedFiles.push(oldVideoKey);
        }

        return res.status(200).json({ 
            message: '更新成功', 
            videoId: videoId, 
            cleanedFiles: cleanedFiles 
        });

    } catch (error) {
        console.error('更新视频失败 (事务中):', error);
        
        try {
            console.log('(事务) [Update] 正在回滚...');
            await sql`ROLLBACK`;
            console.log('(事务) [Update] 回滚成功');
        } catch (rollbackError) {
            console.error('!! 事务回滚失败 [Update] !!:', rollbackError);
        }
        
        return res.status(500).json({ 
            error: '更新失败，数据库已回滚', 
            details: error.message || error.toString() 
        });
    }
};

// --- 处理器 4: DELETE (删除视频) ---
// (此代码来自 delete-video.js)
const handleDelete = async (req, res, sql, cos) => {
    try {
        // (!!! 关键 !!!) DELETE 请求没有 req.body，我们从 query 获取 videoId
        // 我们将在 management.html 中修改 fetch 请求
        const { videoId } = req.query; 
        if (!videoId) {
            return res.status(400).json({ error: '缺少 videoId' });
        }

        console.log(`[Delete] 收到 ID:${videoId} 的删除请求`);

        // 1. 先从数据库查出 COS Keys
        const videoData = await sql`
            SELECT cover_key, video_key 
            FROM videos 
            WHERE id = ${videoId}
        `;
        
        if (videoData.length === 0) {
            throw new Error('视频不存在或已被删除');
        }
        const { cover_key, video_key } = videoData[0];

        // 2. 删除数据库记录
        // (ON DELETE CASCADE 会自动清理 video_tags 和 comments)
        await sql`DELETE FROM videos WHERE id = ${videoId}`;
        console.log(`[Delete] ID:${videoId} 数据库记录删除成功`);

        // 3. 数据库成功后，删除 COS 文件
        await cos.deleteMultipleObject({
            Bucket: 'video-1383328809',
            Region: 'ap-hongkong',
            Objects: [
                { Key: cover_key },
                { Key: video_key },
            ],
        });
        console.log(`[Delete] ID:${videoId} COS 文件 (${cover_key}, ${video_key}) 删除成功`);
        
        // 4. 成功响应
        res.status(200).json({ message: '删除成功', videoId: videoId });

    } catch (error) {
        console.error('删除视频失败:', error);
        res.status(500).json({ error: '删除失败', details: error.message });
    }
};


// --- 主分发器 (Main Dispatcher) ---
// Vercel 会将所有 /api/manage-videos 的请求发送到这里
module.exports = async (req, res) => {
    
    // 1. 初始化数据库
    const connectionString = process.env.DATABASE_URL;
    const sql = neon(connectionString);

    // 2. 根据方法分发
    if (req.method === 'GET') {
        return await handleGet(req, res, sql);
    }
    
    if (req.method === 'POST') {
        return await handleCreate(req, res, sql);
    }

    // PUT 和 DELETE 需要 COS
    const cos = new COS({
        SecretId: process.env.SecretId,
        SecretKey: process.env.SecretKey,
    });

    if (req.method === 'PUT') {
        return await handleUpdate(req, res, sql, cos);
    }

    if (req.method === 'DELETE') {
        return await handleDelete(req, res, sql, cos);
    }

    // 3. 不支持的方法
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};