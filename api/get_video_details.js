// 1. 导入所需模块
const { neon } = require('@neondatabase/serverless');
const crypto = require('crypto');
const connectionString = process.env.DATABASE_URL;
const sql = neon(connectionString);

/**
 * 作用：获取单个视频的详细信息（用于播放页）
 */
module.exports = async (req, res) => {
    if (!connectionString) {
        return res.status(500).json({ error: '数据库连接配置缺失' });
    }
    
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    try {
        const videoId = req.query.id;
        if (!videoId) {
            return res.status(400).json({ error: '缺少 video id' });
        }

        // (修复) 使用 sql`...` 并直接嵌入 ${videoId}
        const result = await sql`
            SELECT 
                v.id, 
                v.title, 
                v.description,
                v.video_key,
                TO_CHAR(v.upload_date AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') AS upload_date,
                
                (SELECT json_agg(t.tag_name)
                 FROM tags t
                 JOIN video_tags vt ON t.tag_id = vt.tag_id
                 WHERE vt.video_id = v.id) AS tags,
                 
                (SELECT json_agg(
                    json_build_object(
                        'content', c.content,
                        'created_at', TO_CHAR(c.created_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI')
                    ) ORDER BY c.created_at DESC
                 )
                 FROM comments c
                 WHERE c.video_id = v.id) AS comments
                 
            FROM videos v
            WHERE v.id = ${videoId}
            GROUP BY v.id;
        `;
        
        if (result.length === 0) {
            return res.status(404).json({ error: '未找到视频' });
        }

        const details = result[0];
        
        // --- CDN 签名逻辑 ---
        const { CDN_AUTH_KEY, CDN_DOMAIN } = process.env;
        if (!CDN_AUTH_KEY || !CDN_DOMAIN) {
            return res.status(500).json({ error: 'CDN 配置缺失' });
        }

        const fullUriPath = `/${details.video_key}`;
        const validSeconds = 3600; 
        const t = Math.floor(Date.now() / 1000) + validSeconds;
        const stringToSign = `${CDN_AUTH_KEY}${fullUriPath}${t}`;
        const sign = crypto.createHash('md5').update(stringToSign, 'utf-8').digest('hex');
        
        const finalResponse = {
            ...details,
            signed_play_url: `https://${CDN_DOMAIN}${fullUriPath}?sign=${sign}&t=${t}`
        };

        res.status(200).json(finalResponse);

    } catch (error) {
        console.error('获取视频详情失败:', error);
        res.status(500).json({ error: '数据库查询失败', details: error.message });
    }
};