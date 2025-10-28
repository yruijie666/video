import COS from 'cos-nodejs-sdk-v5';
import fs from 'fs/promises';
import path from 'path';

// 初始化COS客户端
const cos = new COS({
  SecretId: process.env.SecretId,
  SecretKey: process.env.SecretKey,
});

const BUCKET = 'video-1383328809'; // 你的存储桶
const REGION = 'ap-hongkong';     // 你的地域

// 数据库文件路径
const dbPath = path.join(process.cwd(), 'data', 'videos.json');

export default async function handler(req, res) {
  const { action, key, id } = req.query;

  try {
    // 1. 获取视频列表
    if (req.method === 'GET' && action === 'list') {
      const data = await fs.readFile(dbPath, 'utf-8');
      const videos = JSON.parse(data);
      return res.status(200).json(videos);
    }

    // 2. 获取播放URL
    if (req.method === 'GET' && action === 'get-play-url' && key) {
      const params = { Bucket: BUCKET, Region: REGION, Key: key, Method: 'GET', Expires: 3600 };
      const url = await new Promise((resolve, reject) => {
        cos.getObjectUrl(params, (err, data) => err? reject(err) : resolve(data.Url));
      });
      return res.status(200).json({ url });
    }

    // 3. 获取上传URL
    if (req.method === 'GET' && action === 'get-upload-url' && key) {
      const params = { Bucket: BUCKET, Region: REGION, Key: key, Method: 'PUT', Expires: 3600 };
      const url = await new Promise((resolve, reject) => {
        cos.getObjectUrl(params, (err, data) => err? reject(err) : resolve(data.Url));
      });
      return res.status(200).json({ url });
    }

    // 4. 添加新的视频元数据
    if (req.method === 'POST' && action === 'add-meta') {
        const newVideo = req.body;
        const data = await fs.readFile(dbPath, 'utf-8');
        const videos = JSON.parse(data);
        videos.push(newVideo);
        await fs.writeFile(dbPath, JSON.stringify(videos, null, 2));
        return res.status(200).json({ message: '视频信息添加成功' });
    }

    // 5. 删除视频
    if (req.method === 'DELETE' && action === 'delete' && key) {
      // 从COS删除
      await new Promise((resolve, reject) => {
        cos.deleteObject({ Bucket: BUCKET, Region: REGION, Key: key }, (err, data) => err? reject(err) : resolve(data));
      });
      // 从JSON文件删除
      const data = await fs.readFile(dbPath, 'utf-8');
      let videos = JSON.parse(data);
      videos = videos.filter(v => v.video_key!== key);
      await fs.writeFile(dbPath, JSON.stringify(videos, null, 2));
      return res.status(200).json({ message: '删除成功' });
    }

    return res.status(404).json({ error: '无效的操作' });

  } catch (error) {
    console.error('API 错误:', error);
    return res.status(500).json({ error: '服务器内部错误', details: error.message });
  }
}