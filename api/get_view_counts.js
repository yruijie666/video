// 1. 导入 Neon 的 Serverless 客户端
const { neon } = require('@neondatabase/serverless');
const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);

/**
 * 作用：获取所有视频的播放量
 */
module.exports = async (req, res) => {
    if (!connectionString) {
        return res.status(500).json({ error: '数据库连接配置缺失' });
    }

    // 设置 5 分钟缓存
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    try {
        // (修复) 使用标签模板写法 sql`...`
        const result = await sql`SELECT id, views_count FROM videos;`;

        // 转换为字典格式 { "1": 100, "2": 50 }
        const countsDictionary = result.reduce((acc, row) => {
            acc[row.id] = row.views_count;
            return acc;
        }, {});

        res.status(200).json(countsDictionary);

    } catch (error) {
        console.error('获取播放量失败:', error);
        res.status(500).json({ error: '数据库查询失败', details: error.message });
    }
};