const crypto = require('crypto');

/**
 * 适用于 CDN 鉴权范围 = "所有文件"
 * 这是最简单、最推荐的配置
 */
module.exports = function handler(req, res) {
  try {
    const CDN_AUTH_KEY = process.env.CDN_AUTH_KEY; 
    const CDN_DOMAIN = process.env.CDN_DOMAIN;

    if (!CDN_AUTH_KEY || !CDN_DOMAIN) {
      console.error('环境变量 CDN_AUTH_KEY 或 CDN_DOMAIN 未设置');
      return res.status(500).json({ error: '服务器配置错误' });
    }

    const videoKey = req.query.key;
    if (!videoKey) {
      return res.status(400).json({ error: '缺少 "key" 参数' });
    }

    // 1. 鉴权范围为“所有文件”时，签名路径就是完整路径
    const fullUriPath = videoKey.startsWith('/') ? videoKey : `/${videoKey}`;

    const validSeconds = 3600; 
    const t = Math.floor(Date.now() / 1000) + validSeconds;

    // 2. 核心：使用 fullUriPath (例如 /test_video/lwx.mp4) 来计算签名
    const stringToSign = `${CDN_AUTH_KEY}${fullUriPath}${t}`;
    
    const sign = crypto.createHash('md5')
                       .update(stringToSign, 'utf-8')
                       .digest('hex');

    // 3. 最终 URL 也使用 fullUriPath
    const finalUrl = `https://${CDN_DOMAIN}${fullUriPath}?sign=${sign}&t=${t}`;

    console.log(`[所有文件-逻辑] 签名路径: ${fullUriPath}`);
    console.log(`[所有文件-逻辑] 最终 URL: ${finalUrl}`);
    res.status(200).json({ url: finalUrl });

  } catch (err) {
    console.error('生成 CDN 签名 URL 时出错:', err);
    res.status(500).json({ error: '生成 URL 失败', details: err.message });
  }
};


//http://localhost:3000/api/cdn?key=test_video/lwx.mp4