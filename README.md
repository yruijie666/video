# 📺 基于 Serverless 的视频点播系统

> 一个基于 Vercel Serverless + Neon PostgreSQL + 腾讯云 COS/CDN 构建的现代化 B/S 端视频点播平台。

![Vercel](https://img.shields.io/badge/Vercel-Serverless-black?style=flat-square&logo=vercel)
![PostgreSQL](https://img.shields.io/badge/Database-Neon_(PostgreSQL)-0064a5?style=flat-square&logo=postgresql)
![Tencent Cloud](https://img.shields.io/badge/Cloud-Tencent_COS_%26_CDN-blue?style=flat-square)
![Node.js](https://img.shields.io/badge/Backend-Node.js-green?style=flat-square&logo=node.js)

## 📖 项目简介

本项目是一个全栈视频点播系统，采用了**Serverless 无服务器架构**设计。它解决了传统视频网站运维成本高、带宽压力大、资源容易被盗链等痛点。

系统支持用户端的高流畅播放与互动，同时拥有功能完善的管理后台，支持管理员通过 **STS 临时密钥**直传视频至对象存储，并利用 **SQL 事务**机制保障数据的一致性。

**演示地址**: [点击这里查看 ](https://ruijie-video.cn/)

## ✨ 核心功能

### 🖥️ 用户端 (Client)
- **瀑布流浏览**: 支持视频列表的高效加载与展示。
- **搜索系统**: 支持按视频标题、标签(Tags)进行模糊搜索。
- **安全播放**: 集成腾讯云 CDN，实现 **MD5 URL 签名鉴权**，有效防止盗链。
- **互动评论**: 支持发表评论、查看评论列表。
- **数据统计**: 播放量实时统计（采用 `navigator.sendBeacon` 精准上报）。

### 🛠️ 管理端 (Admin)
- **STS 前端直传**: 采用腾讯云临时密钥（STS）直接从浏览器上传大文件至 COS，不占用服务器带宽。
- **视频管理**: 支持视频的增删改查 (CRUD)，编辑标题、描述及标签。
- **事务保障**: 视频删除/更新时引入 SQL 事务，确保数据库记录与 COS 云端文件的强一致性（自动清理孤儿文件）。
- **评论审核**: 支持按视频或内容筛选评论，并进行删除操作。
- **数据看板**: 可视化展示播放量 Top 5 视频、热门标签统计等维度数据。

## 🏗️ 技术架构

| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端** | HTML5, CSS3, ES6 JS | 原生开发，无框架依赖，轻量高效 |
| **后端** | Vercel Serverless Functions | Node.js 运行时，按需扩容，RESTful API |
| **数据库** | Neon (Serverless PostgreSQL) | 云原生 PG 数据库，支持高并发连接 |
| **对象存储** | 腾讯云 COS | 存储原始视频与封面图片 |
| **内容分发** | 腾讯云 CDN | 边缘加速，配置 Referer 防盗链与 Type-A 签名 |

## 📂 目录结构

```text
.
├── api/                    # Vercel Serverless Functions (后端接口)
│   ├── manage-videos.js    # 视频的获取 创建 更新 删除
│   ├── manage-comments.js  # 评论管理
│   ├── analytics.js        # 数据统计看板
│   ├── get-sts-credentials.js # 获取 COS 上传临时密钥
│   ├── get_video_details.js   # 获取视频详情 (生成 CDN 签名)
│   ├── connect_PgSql.js    # 首页视频流查询
│   ├── add_comment.js      # 添加评论
│   ├── update_view.js      # 更新播放量
│   ├── get_view_counts.js  # 获取全站播放量
│   └── delete-cos-file.js  # 异常补偿机制--数据库记录与 COS 云端文件的强一致性
├── index.html              # 用户端首页
├── player.html             # 视频播放页
└── management.html         # 后台管理系统
