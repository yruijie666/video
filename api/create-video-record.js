// 1. 导入 Neon (使用 CommonJS 规范)
const { neon } = require('@neondatabase/serverless');

// 2. 导出主函数
module.exports = async (req, res) => {
    // 3. 只允许 POST 请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 4. 初始化数据库连接
    const connectionString = process.env.DATABASE_URL;
    const sql = neon(connectionString);

    // 5. 解析前端发来的 JSON 数据
    const { title, description, tags, coverKey, videoKey } = req.body;

    try {
        // 6. 验证
        if (!title || !coverKey || !videoKey) {
            return res.status(400).json({ error: '缺少 title, coverKey 或 videoKey' });
        }
        
        console.log(`收到数据库写入请求: ${title}`);

        // 7. (!!! 关键修复: 手动事务 !!!)
        await sql`BEGIN`; // 1. 开始事务
        console.log(`(事务) BEGIN`);

        // A. 插入 videos 表
        const videoResult = await sql`
            INSERT INTO videos (title, description, cover_key, video_key)
            VALUES (${title}, ${description}, ${coverKey}, ${videoKey})
            RETURNING id
        `;
        
        const newVideoId = videoResult[0].id;
        console.log(`(事务) 视频记录创建成功, ID: ${newVideoId}`);

        // B. 批量插入标签
        let tagIds = [];
        if (tags && tags.length > 0) {
            
            // 1. (优化) 批量插入“不存在”的标签
            await sql`
                INSERT INTO tags (tag_name)
                SELECT tag_name 
                FROM unnest(${tags}::text[]) AS t(tag_name)
                WHERE NOT EXISTS (
                    SELECT 1 FROM tags t_exists WHERE t_exists.tag_name = t.tag_name
                )
            `;

            // 2. (优化) 批量获取所有需要的 tag_id
            const tagResults = await sql`
                SELECT tag_id 
                FROM tags 
                WHERE tag_name = ANY(${tags})
            `;
            tagIds = tagResults.map(t => t.tag_id);

            // 3. (稳定) 使用 for...of 循环来插入关联
            for (const tagId of tagIds) {
                await sql`
                    INSERT INTO video_tags (video_id, tag_id)
                    VALUES (${newVideoId}, ${tagId})
                    ON CONFLICT (video_id, tag_id) DO NOTHING
                `;
            }
            console.log(`(事务) 标签关联完成: [${tags.join(', ')}]`);
        }
        
        // 8. (!!! 关键 !!!) 提交事务
        await sql`COMMIT`;
        console.log(`(事务) COMMIT 成功`);
        
        // 9. 成功响应 (只有在 COMMIT 成功后才会执行到这里)
        return res.status(200).json({ 
            message: '数据库记录创建成功', 
            video: { newVideoId, title, tagIds } 
        });

    } catch (error) {
        // 10. (!!! 关键 !!!) 捕获 SQL 事务失败
        console.error('数据库事务写入失败:', error);
        
        // 10A. 尝试回滚
        try {
            console.log('(事务) 正在回滚...');
            await sql`ROLLBACK`;
            console.log('(事务) 回滚成功');
        } catch (rollbackError) {
            console.error('!! 事务回滚失败 !!:', rollbackError);
        }
        
        // 10B. 检查是否是 video_key 重复的特定错误
        if (error.code === '23505' && error.constraint === 'videos_video_key_key') {
             return res.status(409).json({ error: '数据库写入失败：视频文件 (video_key) 已存在。', details: error.message });
        }
        
        // 10C. 对于其他所有事务失败，返回 500
        // (前端会捕获 500 错误，并按原计划调用 /api/delete-cos-file 进行补偿)
        return res.status(500).json({ 
            error: '数据库事务写入失败，数据已回滚', 
            details: error.message || error.toString()
        });
    }
};