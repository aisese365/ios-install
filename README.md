# iOS 企业签名安装页

这个目录包含一个可静态部署的 iOS 企业签名应用安装页。

## 文件

- `index.html`：用户访问的安装页，会自动生成 `itms-services://` 安装链接。
- `app.config.json`：App 名称、版本号、Bundle Identifier、IPA 文件名模板等构建配置。
- `scripts/build.mjs`：构建脚本，会生成带 hash 的 iOS 安装描述文件。
- `dist/`：运行构建后生成的静态部署目录。
- `logo.png`、favicon 等图片：安装页使用的静态资源。

## 构建

先在 `app.config.json` 中配置版本号等信息：

```json
{
  "appName": "AI妄想",
  "bundleIdentifier": "ai.purrly.app",
  "version": "1.10.5",
  "logoPath": "logo.png"
}
```

构建时可以通过环境变量指定远程资源前缀：

```sh
npm run build:github
npm run build:cf
```

- `DOMAIN`：二维码内容，支持填写完整 HTTPS 地址；未写协议时会自动补成 HTTPS。manifest 中的图标地址会使用 `DOMAIN` 加 `logoPath`，例如 `DOMAIN=https://example.com/ios-install/` 时会生成 `https://example.com/ios-install/logo.png`。
- `DOWNLOAD_URL`：IPA 完整下载地址模板。
- `DOWNLOAD_URL` 支持 `{version}` 占位符，会替换为 `app.config.json` 里的版本号。

当前 `package.json` 中的脚本为：

```json
{
  "scripts": {
    "build": "npm run build:github",
    "build:github": "DOMAIN=https://aisese365.github.io/ios-install/ DOWNLOAD_URL=https://github.com/aisese365/aisese365.github.io/releases/download/v{version}/aisese-ios-{version}.ipa node scripts/build.mjs",
    "build:cf": "DOMAIN=https://aisese365-ios-install.pages.dev/ DOWNLOAD_URL=https://pub-9f9a433bef504b16b1b30cd09cc00b91.r2.dev/aisese-ios-{version}.ipa node scripts/build.mjs"
  }
}
```

未设置环境变量时，构建脚本默认使用：

```text
DOMAIN=https://aisese.ai
DOWNLOAD_URL=https://download.aisese.ai/aisese-ios-{version}.ipa
```

构建完成后会生成：

```text
dist/index.html
dist/manifest.<hash>.plist
```

`dist/index.html` 会引用带 hash 的 manifest 文件名，例如 `manifest.abc123def456.plist`，避免 iOS 或 CDN 缓存旧的安装描述文件。部署时将 `dist/` 作为静态站点目录。

## GitHub Pages

仓库已包含 GitHub Actions 工作流：`.github/workflows/pages.yml`。

推送到 `main` 分支或在 Actions 页面手动触发 `Deploy GitHub Pages` 后，工作流会运行：

```sh
npm run build:github
```

然后将 `dist/` 发布到 GitHub Pages。首次使用时，需要在 GitHub 仓库设置中打开 Pages，并将 Source 设为 `GitHub Actions`。

## Cloudflare

Cloudflare Workers 静态资源部署使用 `wrangler.toml`：

```toml
[assets]
directory = "./dist"
```

这样 Cloudflare 只会上传构建后的 `dist/`，不会把仓库根目录或 `node_modules/` 当成静态资源上传。

如果使用 Cloudflare Pages 面板部署，请配置：

```text
Build command: npm run build:cf
Build output directory: dist
```

页面支持通过 `lang` 参数切换语言：`zh` 为简体中文，`zh_Hant` 为繁体中文（台湾），`en` 为英文，`jp` 为日文。未提供参数时会根据浏览器语言自动选择。

## Nginx MIME 示例

```nginx
types {
    application/xml plist;
    application/octet-stream ipa;
    image/png png;
    text/html html;
}
```

## 安装要求

- 必须使用有效 HTTPS，不能使用 HTTP 或自签证书。
- 用户需要用 iOS Safari 打开安装页。
- 微信、QQ、钉钉等内置浏览器通常会拦截 `itms-services://`。
- 首次打开应用前，用户需要到设置中信任企业开发者证书。

信任路径：

```text
设置 → 通用 → VPN 与设备管理 → 企业名称 → 信任
```
