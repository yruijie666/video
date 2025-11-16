// 文件名: api/analytics.js
// 职责: 提供 "统计分析" 仪表盘所需的所有数据

const { neon } = require('@neondatabase/serverless');

module.exports = async (req, res) => {
    
    // 1. 仅支持 GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const connectionString = process.env.DATABASE_URL;
    const sql = neon(connectionString);

    try {
        // 2. 并行执行三个 SQL 查询
        const [topVideosResult, topTagsByViewsResult, topTagsByCountResult] = await Promise.all([
            
            // 查询 1: 播放量 Top 5 视频
            sql`
                SELECT id, cover_key, title, views_count 
                FROM videos 
                ORDER BY views_count DESC 
                LIMIT 5
            `,
            
            // 查询 2: 价值 Top 5 标签 (按总播放量)
            sql`
                SELECT 
                    t.tag_name, 
                    SUM(v.views_count) AS total_views
                FROM tags t
                JOIN video_tags vt ON t.tag_id = vt.tag_id
                JOIN videos v ON vt.video_id = v.id
                GROUP BY t.tag_id, t.tag_name
                ORDER BY total_views DESC
                LIMIT 5
            `,
            
            // 查询 3: 热门 Top 5 标签 (按视频数量)
            sql`
                SELECT 
                    t.tag_name, 
                    COUNT(vt.video_id) AS video_count
                FROM tags t
                JOIN video_tags vt ON t.tag_id = vt.tag_id
                GROUP BY t.tag_id, t.tag_name
                ORDER BY video_count DESC
                LIMIT 5
            `
        ]);

        // 3. 成功响应
        res.status(200).json({
            topVideos: topVideosResult,
            topTagsByViews: topTagsByViewsResult,
            topTagsByCount: topTagsByCountResult
        });

    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({ error: '数据库查询失败', details: error.message });
    }
};