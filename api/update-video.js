const { neon } = require('@neondatabase/serverless');
const COS = require('cos-nodejs-sdk-v5');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const connectionString = process.env.DATABASE_URL;
    const sql = neon(connectionString);

    const cos = new COS({
        SecretId: process.env.SecretId,
        SecretKey: process.env.SecretKey,
    });

    // (!!! 关键 !!!) 将数据库操作和 COS 操作分离
    // 数据库操作必须在事务中
    // COS 操作必须在事务成功 *之后*
    
    try {
        // 1. 获取所有数据
        const { 
            videoId, title, description, tags, 
            newCoverKey, newVideoKey,
            oldCoverKey, oldVideoKey 
        } = req.body;

        // 2. 验证
        if (!videoId || !title || oldCoverKey === undefined || oldVideoKey === undefined) {
            return res.status(400).json({ error: '缺少必要参数 (id, title, oldKeys)' });
        }
        
        console.log(`[Update] 收到 ID:${videoId} 的更新请求`);

        // 3. 决定最终要写入数据库的 Key。
        const finalCoverKey = newCoverKey || oldCoverKey;
        const finalVideoKey = newVideoKey || oldVideoKey;

        // 4. (!!! 关键修复: 手动事务 !!!)
        await sql`BEGIN`; // 1. 开始事务
        console.log(`(事务) [Update] BEGIN`);

        // A. 更新 videos 表
        await sql`
            UPDATE videos
            SET 
                title = ${title}, 
                description = ${description}, 
                cover_key = ${finalCoverKey}, 
                video_key = ${finalVideoKey},
                upload_date = CURRENT_TIMESTAMP
            WHERE id = ${videoId}
        `;
        console.log(`(事务) [Update] ID:${videoId} videos 表更新成功`);

        // B. 删除所有旧标签关联
        await sql`DELETE FROM video_tags WHERE video_id = ${videoId}`;

        // C. 批量插入新标签并重新关联
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
            const tagIds = tagResults.map(t => t.tag_id);

            // 3. (稳定) 使用 for...of 循环来插入关联
            for (const tagId of tagIds) {
                await sql`
                    INSERT INTO video_tags (video_id, tag_id)
                    VALUES (${videoId}, ${tagId})
                    ON CONFLICT (video_id, tag_id) DO NOTHING
                `;
            }
        }
        console.log(`(事务) [Update] ID:${videoId} 标签更新成功`);
        
        // 5. (!!! 关键 !!!) 提交事务
        await sql`COMMIT`;
        console.log(`(事务) [Update] COMMIT 成功`);

        // --- 数据库事务到此结束 ---

        // 6. 数据库成功后，清理旧的 COS 文件 (这个逻辑在事务 *之外* 是正确的)
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

        // 7. 成功响应
        return res.status(200).json({ 
            message: '更新成功', 
            videoId: videoId, 
            cleanedFiles: cleanedFiles 
        });

    } catch (error) {
        // 8. (!!! 关键 !!!) 捕获 SQL 事务失败
        console.error('更新视频失败 (事务中):', error);
        
        // 8A. 尝试回滚
        try {
            console.log('(事务) [Update] 正在回滚...');
            await sql`ROLLBACK`;
            console.log('(事务) [Update] 回滚成功');
        } catch (rollbackError) {
            console.error('!! 事务回滚失败 !!:', rollbackError);
        }
        
        // 8B. 数据库回滚了，是干净的。
        // 我们什么都不用做，只返回错误 (前端的补偿也不需要)
        return res.status(500).json({ 
            error: '更新失败，数据库已回滚', 
            details: error.message || error.toString() 
        });
    }
};