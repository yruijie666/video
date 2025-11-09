// 作用：获取单个视频的详细信息
// (修改) (要求 2+3) 现在在后端直接生成 CDN 签名，解决瀑布问题

const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto'); // (要求 2+3) 导入 crypto

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("DATABASE_URL 环境变量未设置!");
}

/**
 * (要求 2+3) 用于生成 CDN 签名的辅助函数
 * (此逻辑从 cdn.js 复制而来)
 */
function getSignedCdnUrl(videoKey) {
    const CDN_AUTH_KEY = process.env.CDN_AUTH_KEY; 
    const CDN_DOMAIN = process.env.CDN_DOMAIN;

    if (!CDN_AUTH_KEY || !CDN_DOMAIN) {
        console.error('环境变量 CDN_AUTH_KEY 或 CDN_DOMAIN 未设置');
        // 如果配置缺失，返回 null，前端将显示错误
        return null;
    }
    
    const fullUriPath = videoKey.startsWith('/') ? videoKey : `/${videoKey}`;
    const validSeconds = 3600; 
    const t = Math.floor(Date.now() / 1000) + validSeconds;
    const stringToSign = `${CDN_AUTH_KEY}${fullUriPath}${t}`;
    
    const sign = crypto.createHash('md5')
                       .update(stringToSign, 'utf-8')
                       .digest('hex');
                       
    return `https://${CDN_DOMAIN}${fullUriPath}?sign=${sign}&t=${t}`;
}


/**
 * Vercel Serverless Function 处理函数。
 */
module.exports = async (req, res) => {

    if (!connectionString) {
        return res.status(500).json({ error: '数据库连接配置缺失' });
    }
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: '只允许 GET 请求' });
    }

    const sql = neon(connectionString);
    const { id } = req.query;

    if (!id || isNaN(Number(id))) {
        return res.status(400).json({ error: '缺少有效的 video id' });
    }

    const videoId = Number(id);

    try {
        // --- 1. 获取数据库数据 ---
        // (此 SQL 查询与上一版相同)
        const result = await sql`
            SELECT 
                v.id, v.title, v.description, v.video_key, v.views_count,
                TO_CHAR(
                    v.upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS'
                ) AS upload_date,
                (
                    SELECT COALESCE(json_agg(json_build_object('tag_name', t.tag_name)), '[]')
                    FROM tags t JOIN video_tags vt ON t.tag_id = vt.tag_id WHERE vt.video_id = v.id
                ) AS tags,
                (
                    SELECT COALESCE(json_agg(json_build_object(
                        'content', c.content,
                        'created_at', TO_CHAR(c.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI')
                    ) ORDER BY c.created_at DESC), '[]')
                    FROM comments c WHERE c.video_id = v.id
                ) AS comments
            FROM videos v
            WHERE v.id = ${videoId}
            GROUP BY v.id;
        `;

        if (result.length === 0) {
            return res.status(404).json({ error: '未找到该 ID 的视频' });
        }
        
        const videoDetails = result[0];

        // --- 2. (要求 2+3) 在服务器端生成签名 URL ---
        const signedPlayUrl = getSignedCdnUrl(videoDetails.video_key);
        
        if (!signedPlayUrl) {
            // 如果 CDN 环境变量缺失，返回 500
            return res.status(500).json({ error: '服务器 CDN 配置错误' });
        }

        // --- 3. 将 URL 添加到响应中 ---
        videoDetails.signed_play_url = signedPlayUrl;

        // 设置缓存 (这会缓存数据库结果 + 签名 URL)
        res.setHeader('Cache-Control', 'public, s-maxage=1200, stale-while-revalidate=30');

        // (修改) 返回包含 signed_play_url 的完整对象
        res.status(200).json(videoDetails);

    } catch (error) {
        console.error('获取视频详情错误:', error);
        res.status(500).json({ 
            error: '数据库查询失败', 
            details: error.message 
        });
    }
};