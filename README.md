# iOS 企业签名安装页

这个目录包含一个可静态部署的 iOS 企业签名应用安装页。

## 文件

- `index.html`：用户访问的安装页，会自动生成 `itms-services://` 安装链接。
- `manifest.plist`：iOS 安装描述文件模板。
- `purrly.ipa`：需要你自己放入目录或对象存储的 IPA 文件。
- `icon-57.png`、`icon-512.png`：需要你自己替换的展示图标。

## 部署前替换

打开 `manifest.plist`，替换下面几项：

- `https://example.com/purrly.ipa`：改成真实 IPA 的 HTTPS 地址。
- `https://example.com/icon-57.png`：改成 57x57 图标 HTTPS 地址。
- `https://example.com/icon-512.png`：改成 512x512 图标 HTTPS 地址。
- `com.yourcompany.purrly`：改成 App 的真实 Bundle Identifier。
- `1.0.0`：改成当前版本号。
- `PurrlyAI`：展示给用户的 App 名称。

安装页当前固定使用 `https://ios-install.purrly.ai/manifest.plist` 作为描述文件地址。

Cloudflare Pages 部署后，`/ios-install` 会通过 `_redirects` 重写到根目录的安装页。

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
