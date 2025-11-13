// 作用：连接 Neon 数据库，支持搜索，并添加缓存
const { neon } = require('@neondatabase/serverless');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("DATABASE_URL 环境变量未设置!");
}

/**
 * Vercel Serverless Function 处理函数。
 */
module.exports = async (req, res) => {
    
    if (!connectionString) {
        return res.status(500).json({ error: '数据库连接配置缺失', details: '请在环境变量中设置 DATABASE_URL' });
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许 GET 请求' });
    }

    const sql = neon(connectionString);
    const { search } = req.query;

    let result = [];

    try {
        if (search) {
            // --- 搜索逻辑 ---
            const searchTerm = `%${search}%`;
            const tagTerm = search;

            result = await sql`
                WITH videos_query AS (
                    SELECT 
                        id, title, description, cover_key, video_key, 
                        TO_CHAR(upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS upload_date, 
                        views_count
                    FROM videos
                )
                
                SELECT * FROM videos_query
                WHERE title ILIKE ${searchTerm}

                UNION

                SELECT vq.* FROM videos_query vq
                JOIN video_tags vt ON vq.id = vt.video_id
                JOIN tags t ON vt.tag_id = t.tag_id
                WHERE t.tag_name = ${tagTerm}
                
                ORDER BY id ASC;
            `;

        } else {
            // --- 默认逻辑 (获取全部) ---
            result = await sql`
                SELECT 
                    id, title, description, cover_key, video_key, 
                    TO_CHAR(upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS upload_date, 
                    views_count
                FROM videos
                ORDER BY id ASC;
            `;
        }
        
        // (修正2) 统一缓存时间为 5 分钟 (300秒)
        // 解决播放量和评论的数据不一致问题
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');

        res.status(200).json(result);

    } catch (error) {
        console.error('数据库查询错误:', error);
        res.status(500).json({ 
            error: '数据库查询失败', 
            details: error.message 
        });
    }
};