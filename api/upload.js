// 1. ⚠️ 导入 COS SDK 和 Node.js 的 'fs' (File System) 模块
const COS = require('cos-nodejs-sdk-v5');
const fs = require('fs');
const path = require('path'); // 导入 path 模块

// 2. ⚠️ 同样使用 CommonJS 语法导出
module.exports = function handler(req, res) {

  // --- 1. 定义文件路径 ---
  // ⚠️ 这是你本地电脑上的文件绝对路径
  const localFilePath = 'D:\\temp_video\\test123.mp4';
  
  // ⚠️ 这是你希望在 COS 存储桶中保存的路径和文件名
  const cosKey = 'test_video/test123.mp4';

  // --- 2. 检查本地文件是否存在 ---
  // (这是一个好习惯，防止因文件不存在而报错)
  if (!fs.existsSync(localFilePath)) {
    console.error(`本地文件未找到: ${localFilePath}`);
    return res.status(400).json({ 
      error: '文件未在服务器本地路径找到', 
      path: localFilePath 
    });
  }

  // --- 3. 初始化 COS 客户端 ---
  // (使用你 .env.local 里的永久密钥)
  const cos = new COS({
    SecretId: process.env.SecretId,
    SecretKey: process.env.SecretKey,
  });

  // --- 4. 准备上传参数 ---
  const params = {
    Bucket: 'video-1383328809', // 你的存储桶
    Region: 'ap-hongkong',     // 你的存储桶地域 (从你之前的代码中获取)
    Key: cosKey,               // 上传到 COS 的路径
    
    // 关键：Body 使用 fs.createReadStream 将文件流式上传
    // 这是最高效的方式，不会占用大量内存
    Body: fs.createReadStream(localFilePath),
    
    // 关键：提供文件大小，有助于 COS 优化
    ContentLength: fs.statSync(localFilePath).size,
    
    // (可选) 监听上传进度
    onProgress: function(progressData) {
        console.log('上传进度', JSON.stringify(progressData));
    }
  };

  // --- 5. 执行上传 ---
  // 在 Node.js SDK 中，我们使用 putObject 来上传
  cos.putObject(params, (err, data) => {
    // 6. 处理结果
    if (err) {
      console.error('上传失败:', err);
      return res.status(500).json({ error: '上传到 COS 失败', details: err });
    }
    
    // 上传成功，data 中会包含 ETag 和 Location (访问地址)
    console.log('上传成功:', data);
    res.status(200).json({ 
      message: '上传成功', 
      location: data.Location, // 返回文件的访问 URL
      data: data
    });
  });
}