// 1. ⚠️ 使用 CommonJS 语法导入腾讯云COS的SDK
const COS = require('cos-nodejs-sdk-v5');

// 2. ⚠️ 使用 CommonJS 语法导出函数
module.exports = function handler(req, res) {

  // 1. 初始化COS客户端
  // 注意：我们使用了更规范的环境变量名，确保你在Vercel网站上也是这样设置的
  const cos = new COS({
    SecretId: process.env.SecretId,
    SecretKey: process.env.SecretKey,
  });

  // 2. 准备生成URL所需的参数
  const params = {
    Bucket: 'video-1383328809', // 你的存储桶全称（格式：桶名-APPID），这个看起来是正确的
    Region: 'ap-hongkong',                  // 你的存储桶所在地域
    Key: 'lwx.mp4',                         // 你要访问的视频文件名，确保这个文件确实存在于你的存储桶中
    Method: 'GET',                          // 我们要生成一个用于获取(播放)的链接
    Expires: 3600,                          // 链接的有效时间，单位秒。这里是1小时
  };

  // 3. 调用SDK生成预签名URL (注意：这里是关键的修改)
  cos.getObjectUrl(params, (err, data) => {
    // 4. 处理结果
    if (err) {
      console.error('生成签名URL失败:', err);
      // 如果出错，返回500错误和详细信息
      return res.status(500).json({ error: '生成URL失败', details: err });
    }
    
    // 如果成功，返回200状态码和一个包含URL的JSON对象
    console.log('成功生成URL:', data.Url);
    res.status(200).json({ url: data.Url });
  });
}


///  F:\node_v20\node-v20.19.5-win-x64\vercel dev
