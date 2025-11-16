// 1. 导入 Neon
const { neon } = require('@neondatabase/serverless');

// 2. 导出主函数
module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const connectionString = process.env.DATABASE_URL;
    const sql = neon(connectionString);

    try {
        // 3. 获取查询参数 (分页和搜索)
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '5', 10); // 默认每页 5 个
        const search = req.query.search || ''; // 搜索词
        const offset = (page - 1) * limit;

        const searchPattern = `%${search}%`;

        // 4. 构建 SQL 查询
        // (!!! 关键 !!!) 
        // a. 使用 LEFT JOIN 和 json_agg 来获取每个视频的标签数组
        // b. 使用 COUNT(*) OVER() 来获取总行数 (用于分页)
        // c. 使用 HAVING 子句来按标题或标签数组进行搜索
        const videosQuery = sql`
            WITH VideoData AS (
                SELECT 
                    v.id, 
                    v.title, 
                    v.description,
                    v.cover_key, 
                    v.video_key,
                    v.views_count,
                    TO_CHAR(v.upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS upload_date,
                    -- 聚合标签
                    COALESCE(
                        json_agg(
                            json_build_object('tag_id', t.tag_id, 'tag_name', t.tag_name)
                        ) FILTER (WHERE t.tag_id IS NOT NULL), 
                        '[]'
                    ) AS tags,
                    -- 用于搜索的聚合标签文本
                    STRING_AGG(t.tag_name, ', ') AS tag_names
                FROM videos v
                LEFT JOIN video_tags vt ON v.id = vt.video_id
                LEFT JOIN tags t ON vt.tag_id = t.tag_id
                GROUP BY v.id
            ),
            FilteredData AS (
                SELECT 
                    *,
                    COUNT(*) OVER() AS total_count -- 获取过滤后的总数
                FROM VideoData
                WHERE 
                    title ILIKE ${searchPattern} 
                    OR 
                    tag_names ILIKE ${searchPattern}
            )
            SELECT * FROM FilteredData
            ORDER BY id DESC
            LIMIT ${limit}
            OFFSET ${offset};
        `;

        const result = await videosQuery;
        
        const totalCount = result.length > 0 ? parseInt(result[0].total_count, 10) : 0;
        const totalPages = Math.ceil(totalCount / limit);

        // 清理掉 total_count 字段，使其不返回给前端
        result.forEach(r => delete r.total_count);

        // 5. 返回结果
        res.status(200).json({
            videos: result,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCount: totalCount,
                limit: limit
            }
        });

    } catch (error) {
        console.error('获取视频列表失败:', error);
        res.status(500).json({ error: '数据库查询失败', details: error.message });
    }
};