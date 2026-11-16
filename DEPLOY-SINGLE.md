# 小羊慢慢 · 单机网页版部署说明

本项目已改造为**纯前端单机版**：不需要 Go 后端、不需要数据库、不需要账号系统。
把构建产物丢到任意静态服务器（Nginx / Apache / CDN / OSS / GitHub Pages）即可打开游玩。

## 一、本地开发与启动

前置：Node.js 22+（项目用 Vite 7，官方推荐 Node 24+）

```bash
npm ci            # 安装依赖（首次）
npm run dev       # 启动开发服务器，浏览器打开 http://localhost:4318
```

**⚠️ 一定不要直接双击 `dist/index.html` 打开！**
`dist/` 是构建产物，里面用 `<script type="module">` 加载 JS。浏览器出于安全限制，
**ES 模块禁止通过 file:// 协议运行**，直接双击会白屏（页面一片空白，但没任何报错）。
这是所有 Vite/Webpack 构建应用的通用现象，不是代码问题。

本地要看成品效果，用下面任意一种方式：

```bash
npm run start        # 方式一：启动本地静态服务器，浏览器打开 http://localhost:4378
```

```bash
npm run build && npx serve dist   # 方式二：任意静态服务器工具，如 npx serve
```

```bash
python -m http.server 4399 -d dist  # 方式三：或用 Python 起服务器，浏览器开 http://localhost:4399
```

## 二、构建

```bash
npm run build
```

产物在 `dist/` 目录，里面是纯静态文件（HTML / JS / CSS / 图片 / 3D 模型）。

## 三、部署到服务器（关键）

**只要能托管静态文件就行**，把 `dist/` 里的内容放到服务器的网站根目录。
资源引用已全部改为**相对路径**，所以放在**子目录**也能正常打开（不需要配 SPA 回退也影响不大，因为本游戏是单页无路由）：

```bash
# 示例：Nginx
scp -r dist/* user@你的服务器:/var/www/little-flock/
```

Nginx 配置示例（`/etc/nginx/conf.d/little-flock.conf`）：

```nginx
server {
    listen 80;
    server_name your-domain.com;   # 换成你的域名或 IP
    root /var/www/little-flock;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;   # SPA 路由回退
    }

    # 静态资源长缓存，加载更快
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

> 用 IP + 非 80 端口也可以，比如 `http://192.168.1.100:8080`，一点没区别。

### 部署要点

| 事项 | 说明 |
| --- | --- |
| 需不需要 Node | 不需要，服务器上不用装 Node / Go / PostgreSQL |
| 需不需要数据库 | 不需要，存档保存在**访问者的浏览器 localStorage** 里 |
| 多人联机 | 不支持（单机版），但同一设备上的多个牧场/进度都保留 |
| 手机 / Pad | 原生支持，自适应布局 + 触摸摇杆，竖屏横屏都行 |
| HTTPS | 建议开启（语音朗读和剪贴板在 HTTPS 下更稳），不强制 |
| 缓存 | `/assets/` 可一年长缓存，`index.html` 不要长缓存 |

## 四、账号说明（重要）

**没有账号、没有密码、不用注册登录。**

- 打开就是"开启牧场生活"，直接玩；
- 可以给牧羊人起名、换形象（保存在本设备）；
- 所有牧场存档都在当前浏览器里，换浏览器 / 清缓存会丢，务必提醒使用者。

## 五、学习功能（新增）

游戏内右上角新增「学习小屋」，随时可进：

- **认数字**：1-10 数字 + 数羊游戏
- **学字母**：26 个英文字母大小写
- **读唐诗**：10 首入门唐诗挖空补句，自动语音朗读

答题奖励融入游戏经济：每轮 5 题，答对数越多奖励越多（金币 + 经验），
全对还有额外惊喜。答错不扣任何东西，孩子可以放心试错。

## 六、目录结构（改动摘要）

```
src/game/engine.ts       # 游戏引擎（原 Go 后端规则移植，纯 TS）
src/game/localRoom.ts    # 本地房间运行时（原 WebSocket/认证，存档用 localStorage）
src/game/study.ts        # 学习内容库（数字/字母/唐诗 + 语音）
src/ui/StudyRoom.tsx     # 学习小屋面板
src/game/api.ts          # 本地 API（原 REST 调用，签名不变，UI 零改动）
src/ui/Welcome.tsx       # 单机入口（去掉登录注册）
```

原有玩法（养羊/种植/放牧/繁育/委托/图鉴/观星/换装）全部保留，无删减。

## 七、常见问题

**Q: 提示"加入牧场需要邀请码"？**
单机版把「加入好友」移除，加入操作用友好提示兜底，不影响任何现有功能。

**Q: 语音朗读没声音？**
需要浏览器支持 Web Speech API（Chrome / Edge 都支持），且要 HTTPS 或有用户手势后触发。
点题目旁的小喇叭可手动朗读。

**Q: 存档会丢吗？**
只在当前浏览器 localStorage 里。换设备 / 换浏览器 / 清除站点数据会重置。
建议同一台设备固定用一个浏览器。