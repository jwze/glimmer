# 微光 · Glimmer

基于粒子地球与星云的交互式网页，让视线在地理光点之间自由漫游。

- **静观**：缓缓自转的展示地球，保持安静、不可拖动的首页体验。
- **地球**：旋转、缩放与点选地点，查看坐标和当地时间，支持城市、国家及经纬度搜索。
- **星云**：地理光点汇聚为彩色云团，可切换视角、筛选区域、收藏地点和分享场景。

提供纯净模式、亮度调节、省电模式与减少动态效果。字体和地图资源均从本地加载，收藏与偏好保存在当前浏览器。

## 技术栈

TypeScript、Three.js、Vite。需要 Node.js 20.19+（20.x）或 22.12+。

## 本地运行

```bash
npm ci
npm run dev
```

打开终端显示的本地地址。

## 构建与静态部署

```bash
npm run build
npm run preview
```

`npm run preview` 用于本地检查构建结果。正式部署时，将 `dist/` 上传到静态托管服务，无需后端服务。

默认部署在域名根路径。如果托管在子路径（例如 `https://example.com/glimmer/`），请指定包含末尾斜杠的路径：

```bash
npm run build -- --base /glimmer/
```

构建会同步调整脚本、样式、字体和地图数据的加载路径。部署时保留 `dist/` 的完整目录结构。

## Docker 部署

需要安装并启动 Docker，以及 Docker Compose 插件；无需在宿主机安装 Node.js。镜像分两阶段构建：Node.js 22 编译项目，Nginx 提供静态文件。

在项目根目录运行：

```bash
docker compose up -d --build
```

打开 <http://localhost:8080>。服务器部署时，将 `localhost` 替换为服务器地址，并开放对应端口。默认映射宿主机 `8080` 端口到容器 `80` 端口，可修改 `compose.yaml` 中的端口映射，或在项目根目录的 `.env` 中设置：

```dotenv
GLIMMER_PORT=8088
```

修改端口后重新执行 `docker compose up -d --build`，通过新端口访问。容器包含 HTTP 健康检查，并配置了 `unless-stopped` 重启策略。

常用管理命令：

```bash
# 查看运行状态与健康状态
docker compose ps

# 查看服务日志
docker compose logs -f glimmer

# 更新代码后重新构建并启动
docker compose up -d --build

# 停止并移除容器
docker compose down
```

也可以直接使用 Docker：

```bash
docker build -t glimmer:local .
docker run -d --name glimmer --restart unless-stopped -p 8080:80 glimmer:local
```

容器默认服务于站点根路径。绑定域名和启用 HTTPS 时，在容器前配置 Caddy、Nginx 等反向代理，将域名根路径转发到宿主机的服务端口。镜像内已配置静态资源压缩、带哈希文件的长期缓存和首页缓存重新验证。

## GitHub Actions 部署 GitHub Pages

仓库内置工作流 [deploy-pages.yml](.github/workflows/deploy-pages.yml)，使用 GitHub 官方 Pages Actions 构建和发布，无需维护 `gh-pages` 分支或配置个人访问令牌。

1. 将项目推送到 GitHub 仓库，默认分支使用 `main` 或 `master`。
2. 进入仓库 **Settings → Pages → Build and deployment**，将 **Source** 设置为 **GitHub Actions**。仓库须符合当前 GitHub 套餐的 Pages 使用条件。
3. 将部署配置推送到默认分支；以后每次推送到该分支都会自动构建并部署。也可以进入 **Actions → Deploy to GitHub Pages → Run workflow**，选择默认分支手动运行。
4. 在工作流的部署结果或 **Settings → Pages** 中查看网站地址。普通项目仓库通常为 `https://<用户名>.github.io/<仓库名>/`；`<用户名>.github.io` 仓库部署在域名根路径。

工作流会读取 Pages 配置并自动设置 Vite 的 `base`，支持仓库子路径和根路径。分享场景使用 URL 查询参数，刷新和打开分享链接无需额外的路由回退配置。

如果默认分支使用其他名称，请同步修改工作流的 `on.push.branches`。自动发布仅允许默认分支；使用自定义 Pages 域名时，先在 **Settings → Pages** 配置域名并按 GitHub 提示设置 DNS，再重新运行工作流，让构建采用对应路径。

若工作流提示 Pages 未启用，先检查 **Source** 设置；若部署被环境规则阻止，在 **Settings → Environments → github-pages** 中允许默认分支部署。工作流已配置构建所需的只读权限，以及发布所需的 `pages: write` 和 `id-token: write`。

由 **jvz** 开发，采用 [MIT 许可](LICENSE)。
