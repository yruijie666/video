// 1. 导入 STS SDK
const STS = require('qcloud-cos-sts');

// 2. 导出主函数
module.exports = (req, res) => {
    
    // 3. 准备 STS.getCredential 所需的配置
    const config = {
        secretId: process.env.SecretId,
        secretKey: process.env.SecretKey,
        durationSeconds: 1800,
        
        // 权限策略
        policy: {
            version: '2.0',
            statement: [
                {
                    action: [
                        // (!!! 关键修复 !!!) 
                        // 补全分块上传所需的所有权限
                        
                        // 1. 简单上传
                        'name/cos:PutObject',
                        'name/cos:PostObject',
                        
                        // 2. 分块上传
                        'name/cos:InitiateMultipartUpload',
                        'name/cos:UploadPart',
                        'name/cos:CompleteMultipartUpload',
                        'name/cos:ListParts', // <-- (你缺失的权限)
                        'name/cos:ListMultipartUploads' // <-- (你缺失的权限)
                    ],
                    effect: 'allow',
                    // (!!! 规范性修复 !!!) 添加 principal
                    principal: {'qcs': ['*']}, 
                    resource: [
                        // 你的 resource 字符串没问题，我们用这个清晰的版本
                        'qcs::cos:ap-hongkong:uid/1383328809:video-1383328809/covers/*',
                        'qcs::cos:ap-hongkong:uid/1383328809:video-1383328809/videos/*',
                    ],
                },
            ],
        },
    };

    // 4. 包装成 Promise
    const getCredentialsPromise = new Promise((resolve, reject) => {
        STS.getCredential(config, (err, tempKeys) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(tempKeys);
        });
    });

    // 5. 执行 Promise
    getCredentialsPromise
        .then((tempKeys) => {
            // 6. 成功
            const result = {
                ...tempKeys.credentials,
                expiredTime: tempKeys.expiredTime,
                startTime: tempKeys.startTime,
            };
            res.status(200).json(result);
        })
        .catch((error) => {
            // 7. 失败
            console.error('获取 STS 密钥失败:', error);
            res.status(500).json({ error: '获取临时密钥失败', details: error.message });
        });
};