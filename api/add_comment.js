// 作用：(要求1) 接收 POST 请求，向 comments 表插入新评论

const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("DATABASE_URL 环境变量未设置!");
}

/**
 * Vercel Serverless Function 处理函数。
 * @param {object} req - HTTP 请求对象
 * @param {object} res - HTTP 响应对象
 */
module.exports = async (req, res) => {

    if (!connectionString) {
        return res.status(500).json({ error: '数据库连接配置缺失' });
    }
    
    // (要求1) 必须是 POST 请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允许 POST 请求' });
    }

    const sql = neon(connectionString);
    
    try {
        // Vercel 会自动解析 JSON body
        const { videoId, content } = req.body;

        // --- 安全校验 ---
        if (!videoId || isNaN(Number(videoId))) {
            return res.status(400).json({ error: '缺少有效的 videoId' });
        }
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: '评论内容不能为空' });
        }
        // ------------------

        // 插入新评论，并使用 RETURNING 立即取回新数据（特别是 created_at）
        // 并且我们立即格式化 created_at，以便前端直接使用
        const newComment = await sql`
            INSERT INTO comments (video_id, content) 
            VALUES (${Number(videoId)}, ${content.trim()})
            RETURNING 
                content, 
                TO_CHAR(
                    created_at AT TIME ZONE 'Asia/Shanghai',
                    'YYYY-MM-DD HH24:MI'
                ) AS created_at
        `;

        // newComment 是一个数组，我们返回插入的第一个（也是唯一一个）
        if (newComment.length > 0) {
            // 返回 201 Created，并带上新评论的数据
            res.status(201).json(newComment[0]);
        } else {
            throw new Error('评论插入失败，未返回数据');
        }

    } catch (error) {
        console.error('添加评论错误:', error);
        res.status(500).json({ 
            error: '数据库插入失败', 
            details: error.message 
        });
    }
};