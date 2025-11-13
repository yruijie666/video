// 1. 导入 Neon 的 Serverless 客户端
const { neon } = require('@neondatabase/serverless');
const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);

/**
 * 作用：向指定视频添加一条评论
 */
module.exports = async (req, res) => {
    if (!connectionString) {
        return res.status(500).json({ error: '数据库连接配置缺失' });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允许 POST 请求' });
    }
    
    try {
        const { videoId, content } = req.body;

        if (!videoId || !content) {
            return res.status(400).json({ error: '缺少 videoId 或 content' });
        }
        if (content.trim().length === 0) {
            return res.status(400).json({ error: '评论内容不能为空' });
        }

        // (修复) 使用 sql`...` 并直接嵌入变量
        // Neon 会自动处理参数转义，防止注入
        const result = await sql`
            INSERT INTO comments (video_id, content) 
            VALUES (${videoId}, ${content})
            RETURNING content, TO_CHAR(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS created_at;
        `;
        
        res.status(201).json(result[0]);

    } catch (error) {
        console.error('添加评论失败:', error);
        res.status(500).json({ error: '数据库插入失败', details: error.message });
    }
};