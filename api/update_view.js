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
    
    const videoId = req.query.id;
    if (!videoId) {
        return res.status(400).json({ error: '缺少 video id' });
    }
    
    // (修复 3) 拦截非法字符，防止数据库底层 500
    if (isNaN(Number(videoId)) || Number(videoId) < 0) {
        return res.status(400).json({ error: '非法的 video id 格式' });
    }
    
    try {
        // (修复 2) 加上 RETURNING id，用于判断是否真的更新了行
        const result = await sql`
            UPDATE videos 
            SET views_count = views_count + 1 
            WHERE id = ${videoId}
            RETURNING id;
        `;
        
        // 如果没有返回 id，说明数据库里根本没这个视频
        if (result.length === 0) {
            return res.status(404).json({ error: '视频不存在，无法更新播放量' });
        }
        
        res.status(204).end();

    } catch (error) {
        console.error('更新播放量失败:', error);
        res.status(500).json({ 
            error: '数据库更新失败', 
            details: error.message 
        });
    }
};