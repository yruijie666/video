// 1. 导入 Neon 的 Serverless 客户端
const { neon } = require('@neondatabase/serverless');
const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);

/**
 * 作用：查询视频列表（用于主页和搜索）
 */
module.exports = async (req, res) => {
    if (!connectionString) {
        return res.status(500).json({ error: '数据库连接配置缺失' });
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许 GET 请求' });
    }

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    try {
        const searchTerm = req.query.search;
        let result;

        if (searchTerm) {
            // --- 搜索逻辑 ---
            // (修复) 使用 sql`...` 并在 SQL 中直接使用 ${...} 插入变量
            // Neon 会自动处理 SQL 注入防御
            const searchPattern = `%${searchTerm}%`;
            
            result = await sql`
                SELECT 
                    v.id, 
                    v.title, 
                    v.cover_key, 
                    TO_CHAR(v.upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS upload_date
                FROM videos v
                WHERE v.title ILIKE ${searchPattern}
                
                UNION
                
                SELECT 
                    v.id, 
                    v.title, 
                    v.cover_key, 
                    TO_CHAR(v.upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS upload_date
                FROM videos v
                JOIN video_tags vt ON v.id = vt.video_id
                JOIN tags t ON vt.tag_id = t.tag_id
                WHERE t.tag_name ILIKE ${searchPattern}
                
                ORDER BY id ASC;
            `;
        } else {
            // --- 默认列表逻辑 ---
            // (修复) 使用 sql`...`
            result = await sql`
                SELECT 
                    id, 
                    title, 
                    cover_key, 
                    TO_CHAR(upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS upload_date
                FROM videos
                ORDER BY id ASC;
            `;
        }
        
        res.status(200).json(result);

    } catch (error) {
        console.error('数据库查询错误:', error);
        res.status(500).json({ error: '数据库查询失败', details: error.message });
    }
};