// 作用：用于增加视频的 views_count 计数
// 接收 /api/update_view?id=...

const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL;

// 检查环境变量
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
    
    // 允许 POST (用于 navigator.sendBeacon) 或 GET (用于简单测试)
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: '只允许 POST 或 GET 请求' });
    }

    const sql = neon(connectionString);
    const { id } = req.query;

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: '缺少有效的 video id' });
    }

    const videoId = Number(id);

    try {
        // 执行 SQL 更新
        // 使用 $1 作为参数化查询，防止 SQL 注入
        await sql`
            UPDATE videos 
            SET views_count = views_count + 1 
            WHERE id = ${videoId}
        `;
        
        // 成功时，返回 204 No Content
        // 204 是 "即发即忘" 型 API 的最佳实践，浏览器不需要处理响应体
        res.status(204).end();

    } catch (error) {
        console.error('播放量更新错误:', error);
        res.status(500).json({ 
            error: '数据库更新失败', 
            details: error.message 
        });
    }
};