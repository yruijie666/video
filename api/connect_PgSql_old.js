// api/get_videos.js
// 作用：连接 Vercel Neon 数据库，查询 videos 表的所有内容，并使用 SQL 将时间转换为中国标准时间 (CST) 的格式化字符串。

// 1. 导入 Neon 的 Serverless 客户端
const { neon } = require('@neondatabase/serverless');

// 2. 获取 DATABASE_URL 环境变量 (使用连接池 URL)
// 警告：请确保 Vercel 项目中已配置 DATABASE_URL
const connectionString = process.env.DATABASE_URL;

// 3. 初始化 Neon SQL 客户端
const sql = neon(connectionString);

/**
 * Vercel Serverless Function 处理函数。
 * @param {object} req - HTTP 请求对象
 * @param {object} res - HTTP 响应对象
 */
module.exports = async (req, res) => {

    if (!connectionString) {
        console.error("DATABASE_URL 环境变量未设置!");
        // 返回 500 错误，提示缺少配置
        return res.status(500).json({ error: '数据库连接配置缺失', details: '请在环境变量中设置 DATABASE_URL' });
    }
    
    // 强制只允许 GET 请求，用于查询数据
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许 GET 请求' });
    }

    try {
        // 执行 SQL 查询：获取 videos 表的所有内容
        // 关键：使用 AT TIME ZONE 和 TO_CHAR 进行时区转换和格式化
        const result = await sql`
            SELECT 
                id, 
                title, 
                description, 
                cover_key, 
                video_key, 
                -- 核心逻辑：直接将 timestamptz 转换为 'Asia/Shanghai' 的壁钟时间
                TO_CHAR(
                    upload_date AT TIME ZONE 'Asia/Shanghai',
                    'YYYY-MM-DD HH24:MI:SS'
                ) AS upload_date, 
                views_count
            FROM videos
            ORDER BY id ASC;
        `;
        
        // 成功时，返回 200 状态码和查询到的视频列表
        res.status(200).json(result);

    } catch (error) {
        console.error('数据库查询错误:', error);
        // 如果出错，返回 500 错误和详细信息
        res.status(500).json({ 
            error: '数据库查询失败', 
            details: error.message 
        });
    }
};

