// 文件名: api/manage-comments.js
// 职责: 提供评论的查询 (GET) 和删除 (DELETE) API

const { neon } = require('@neondatabase/serverless');

// --- 处理器 1: GET (获取评论列表) ---
const handleGet = async (req, res, sql) => {
    try {
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '10', 10);
        const offset = (page - 1) * limit;

        // 两个独立的搜索参数
        const commentSearch = req.query.commentSearch || '';
        const videoSearch = req.query.videoSearch || '';
        
        const commentPattern = `%${commentSearch}%`;
        const videoPattern = `%${videoSearch}%`;

        // (!!! 关键 SQL !!!)
        // 我们使用 JOIN 来获取视频标题，并使用两个独立的 ILIKE 来实现双重筛选
        const commentsQuery = sql`
            WITH CommentData AS (
                SELECT 
                    c.comment_id,
                    c.content,
                    -- 关联 videos 表获取标题
                    v.title AS video_title,
                    -- 格式化时间戳
                    TO_CHAR(c.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI') AS created_at,
                    -- 使用 COUNT(*) OVER() 来获取筛选后的总行数，用于分页
                    COUNT(*) OVER() AS total_count
                FROM comments c
                JOIN videos v ON c.video_id = v.id
                WHERE
                    -- 筛选 1: 评论内容
                    c.content ILIKE ${commentPattern}
                    AND
                    -- 筛选 2: 视频标题
                    v.title ILIKE ${videoPattern}
            ),
            PagedData AS (
                SELECT * FROM CommentData
                ORDER BY created_at DESC -- 评论按最新时间排序
                LIMIT ${limit}
                OFFSET ${offset}
            )
            SELECT * FROM PagedData;
        `;

        const result = await commentsQuery;

        const totalCount = result.length > 0 ? parseInt(result[0].total_count, 10) : 0;
        const totalPages = Math.ceil(totalCount / limit);
        
        // (可选) 清理掉每行都带的 total_count，减少传输体积
        result.forEach(r => delete r.total_count); 

        res.status(200).json({
            comments: result,
            pagination: {
                currentPage: page,
                totalPages: totalPages,
                totalCount: totalCount,
                limit: limit
            }
        });

    } catch (error) {
        console.error('获取评论列表失败:', error);
        res.status(500).json({ error: '数据库查询失败', details: error.message });
    }
};

// --- 处理器 2: DELETE (删除评论) ---
const handleDelete = async (req, res, sql) => {
    try {
        const { commentId } = req.query; 
        if (!commentId) {
            return res.status(400).json({ error: '缺少 commentId' });
        }

        console.log(`[Delete-Comment] 收到 ID:${commentId} 的删除请求`);

        const result = await sql`
            DELETE FROM comments 
            WHERE comment_id = ${commentId}
        `;

        if (result.rowCount === 0) {
            return res.status(404).json({ error: '评论不存在或已被删除' });
        }

        console.log(`[Delete-Comment] ID:${commentId} 评论删除成功`);
        res.status(200).json({ message: '删除成功', commentId: commentId });

    } catch (error) {
        console.error('删除评论失败:', error);
        res.status(500).json({ error: '删除失败', details: error.message });
    }
};


// --- 主分发器 (Main Dispatcher) ---
module.exports = async (req, res) => {
    
    // 1. 初始化数据库
    const connectionString = process.env.DATABASE_URL;
    const sql = neon(connectionString);

    // 2. 根据方法分发
    if (req.method === 'GET') {
        return await handleGet(req, res, sql);
    }
    
    if (req.method === 'DELETE') {
        return await handleDelete(req, res, sql);
    }

    // 3. 不支持的方法
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
};