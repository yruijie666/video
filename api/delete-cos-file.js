const COS = require('cos-nodejs-sdk-v5');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const cos = new COS({
        SecretId: process.env.SecretId,
        SecretKey: process.env.SecretKey,
    });

    try {
        // 1. 从请求体中获取要删除的 keys
        const { coverKey, videoKey } = req.body;

        if (!coverKey || !videoKey) {
            return res.status(400).json({ error: '缺少 coverKey 或 videoKey' });
        }

        console.log(`[补偿] 收到删除请求: ${coverKey}, ${videoKey}`);

        // 2. 准备删除参数
        const objects = [
            { Key: coverKey },
            { Key: videoKey },
        ];

        // 3. (可选) 并行删除
        // 你也可以用 cos.deleteObject 两次
        await cos.deleteMultipleObject({
            Bucket: 'video-1383328809',
            Region: 'ap-hongkong',
            Objects: objects,
        });

        console.log(`[补偿] 成功删除: ${coverKey}, ${videoKey}`);
        res.status(200).json({ message: '孤儿文件清理成功' });

    } catch (error) {
        console.error('[补偿] 删除 COS 文件失败:', error);
        res.status(500).json({ error: '删除 COS 文件失败', details: error.message });
    }
};