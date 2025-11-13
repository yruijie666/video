// 1. 导入 Neon 的 Serverless 客户端
const { neon } = require('@neondatabase/serverless');
const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);

/**
 * 作用：更新单个视频的播放量 ( +1 )
 */
module.exports = async (req, res) => {
    if (!connectionString) {
        return res.status(500).json({ error: '数据库连接配置缺失' });
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: '只允许 POST (或 GET) 请求' });
    }
    
    try {
        const videoId = req.query.id;
        if (!videoId) {
            return res.status(400).json({ error: '缺少 video id' });
        }
        
        // (修复) 使用 sql`...` 并直接嵌入 ${videoId}
        await sql`
            UPDATE videos 
            SET views_count = views_count + 1 
            WHERE id = ${videoId};
        `;
        
        res.status(204).end();

    } catch (error) {
        console.error('更新播放量失败:', error);
        res.status(500).json({ 
            error: '数据库更新失败', 
            details: error.message 
        });
    }
};