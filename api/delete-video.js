const { neon } = require('@neondatabase/serverless');
const COS = require('cos-nodejs-sdk-v5');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const connectionString = process.env.DATABASE_URL;
    const sql = neon(connectionString);

    const cos = new COS({
        SecretId: process.env.SecretId,
        SecretKey: process.env.SecretKey,
    });

    try {
        // 1. 获取要删除的 videoId
        const { videoId } = req.body;
        if (!videoId) {
            return res.status(400).json({ error: '缺少 videoId' });
        }

        console.log(`[Delete] 收到 ID:${videoId} 的删除请求`);

        // 2. (!!! 关键 !!!) 先从数据库查出 COS Keys
        const videoData = await sql`
            SELECT cover_key, video_key 
            FROM videos 
            WHERE id = ${videoId}
        `;
        
        if (videoData.length === 0) {
            throw new Error('视频不存在或已被删除');
        }
        const { cover_key, video_key } = videoData[0];

        // 3. 删除数据库记录
        // (你设置的 ON DELETE CASCADE 会自动清理 video_tags 和 comments)
        await sql`DELETE FROM videos WHERE id = ${videoId}`;
        console.log(`[Delete] ID:${videoId} 数据库记录删除成功`);

        // 4. (!!! 关键 !!!) 数据库成功后，删除 COS 文件
        await cos.deleteMultipleObject({
            Bucket: 'video-1383328809',
            Region: 'ap-hongkong',
            Objects: [
                { Key: cover_key },
                { Key: video_key },
            ],
        });
        console.log(`[Delete] ID:${videoId} COS 文件 (${cover_key}, ${video_key}) 删除成功`);
        
        // 5. 成功响应
        res.status(200).json({ message: '删除成功', videoId: videoId });

    } catch (error) {
        console.error('删除视频失败:', error);
        res.status(500).json({ error: '删除失败', details: error.message });
    }
};