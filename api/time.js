const COS = require('cos-nodejs-sdk-v5');

// 工具函数：将 GMT 时间转换为中文本地时间（格式：YYYY-MM-DD HH:mm:ss）
function convertGmtToLocal(gmtTime) {
    if (!gmtTime) return '未知时间';
    const date = new Date(gmtTime);
    const padZero = (num) => num.toString().padStart(2, '0');
    
    const year = date.getFullYear();
    const month = padZero(date.getMonth() + 1);
    const day = padZero(date.getDate());
    const hour = padZero(date.getHours());
    const minute = padZero(date.getMinutes());
    const second = padZero(date.getSeconds());
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

// Vercel Serverless 函数入口
module.exports = function handler(req, res) {
    const cos = new COS({
        SecretId: process.env.SecretId,
        SecretKey: process.env.SecretKey,
        // LogLevel: 'debug' // 注释调试日志，减少冗余输出
    });

    const params = {
        Bucket: 'video-1383328809',
        Region: 'ap-hongkong',
        Key: 'test_video/lwx.mp4',
    };

    cos.headObject(params, (err, data) => {
        if (err) {
            console.error('查询视频元数据失败:', err);
            return res.status(500).json({
                success: false,
                error: '查询视频元数据失败',
                details: err.message,
                requestId: err.requestId || '无'
            });
        }

        // 提取并转换时间
        const gmtUploadTime = data.headers['last-modified'];
        const localUploadTime = convertGmtToLocal(gmtUploadTime);
        
        // 仅打印视频本地格式上传时间
        console.log('视频本地格式上传时间:', localUploadTime);

        // 响应中保留核心信息，可按需调整
        res.status(200).json({
            success: true,
            videoInfo: {
                uploadTime: {
                    local: localUploadTime // 仅返回本地时间
                    // gmt: gmtUploadTime // 注释原始GMT时间
                }
                // fileSize: { // 注释文件大小相关字段
                //     bytes: parseInt(data.headers['content-length']),
                //     formatted: `${(parseInt(data.headers['content-length']) / 1024 / 1024).toFixed(2)} MB`
                // },
                // fileType: data.headers['content-type'] // 注释文件类型字段
            },
            requestId: data.RequestId
        });
    });
};