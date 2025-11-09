// 1. ⚠️ 导入 COS SDK
const COS = require('cos-nodejs-sdk-v5');

// 2. ⚠️ 同样使用 CommonJS 语法导出
module.exports = function handler(req, res) {

  // --- 1. 定义你要删除的文件 Key ---
  // ⚠️ 这个是被硬编码的，只删除这一个文件
  const cosKey = 'test_video/test123.mp4';

  // --- 2. 初始化 COS 客户端 ---
  // (使用你 .env.local 里的永久密钥)
  const cos = new COS({
    SecretId: process.env.SecretId,
    SecretKey: process.env.SecretKey,
  });

  // --- 3. 准备删除参数 ---
  const params = {
    Bucket: 'video-1383328809', // 你的存储桶
    Region: 'ap-hongkong',     // 你的存储桶地域
    Key: cosKey,               // 要删除的 COS 路径
  };

  // --- 4. 执行删除 ---
  // 在 Node.js SDK 中，我们使用 deleteObject
  cos.deleteObject(params, (err, data) => {
    // 5. 处理结果
    if (err) {
      console.error('删除失败:', err);
      return res.status(500).json({ error: '从 COS 删除失败', details: err });
    }
    
    // 6. 成功处理
    // ⚠️ 删除成功时，COS 返回的状态码是 204 (No Content)
    // data 对象里可能没什么内容，但状态码是 204 就代表成功了
    if (data.statusCode === 204) {
      console.log(`成功删除: ${cosKey}`);
      res.status(200).json({ 
        message: '删除成功', 
        file: cosKey,
        statusCode: data.statusCode
      });
    } else {
      // 这是一个以防万一的捕获
      console.warn('删除时收到非 204 状态码:', data);
      res.status(data.statusCode || 200).json({ 
        message: '删除操作已执行，但状态码不是 204', 
        data: data 
      });
    }
  });
}
