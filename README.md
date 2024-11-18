# TweetSync for Bluesky

一个用于将Twitter帖子同步到Bluesky的Chrome扩展。

## 功能特性
- 在Twitter的帖子下方的按钮中添加Bluesky同步按钮
- 点击按钮可以将帖子同步到Bluesky
- 支持同步文本内容和图片
- 支持同步整个推特串：先发布主帖，然后自动同步评论组成推特串

## 技术实现

### 基础架构
- Chrome Extension Manifest V3
- Bluesky API 集成
- Twitter Web界面交互

### 主要组件
1. manifest.json - 扩展配置文件
2. background.js - 后台服务
3. content.js - 内容脚本
4. popup.html/js - 弹出界面
5. options.html/js - 设置页面

### 实现步骤

1. 基础设置
   - 创建manifest配置
   - 设置必要的权限
   - 构建基础UI界面

2. 功能实现
   - 在Twitter帖子下方添加Bluesky同步按钮
   - 点击按钮后抓取推文内容临时储存在浏览器中
     - 文本内容✅
     - 图片✅
     - 链接✅
     - 推文串
   - 在bluesky主页中点击popup中的按钮将推文同步到bluesky
    - 文本内容✅
    - 图片✅
    - 链接✅
    - 推文串
   - 配置管理

3. 用户界面
   - popup菜单实现
   - 设置界面开发
   - 状态显示

4. 测试与优化
   - 功能测试
   - 性能优化
   - 用户体验改进
