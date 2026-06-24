import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQrCodePng } from "./qr-code.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const configPath = path.join(rootDir, "app.config.json");

const staticFiles = [
  ".nojekyll",
  "_headers",
  "android-chrome-192x192.png",
  "android-chrome-512x512.png",
  "apple-touch-icon.png",
  "favicon-16x16.png",
  "favicon-32x32.png",
  "favicon.ico",
  "logo.png",
  "site.webmanifest"
];

const config = JSON.parse(await fs.readFile(configPath, "utf8"));

const appName = requireString(config.appName, "appName");
const bundleIdentifier = requireString(config.bundleIdentifier, "bundleIdentifier");
const appVersion = requireString(config.version, "version");
const ipaFile = requireString(config.ipaFile, "ipaFile");
const logoPath = requireString(config.logoPath, "logoPath");

const domain = normalizeHttpsBase(process.env.DOMAIN || "https://aisese.ai", "DOMAIN");
const downloadUrlPrefix = normalizeHttpsBase(
  process.env.DOWNLOAD_URL_PREFIX || "https://download.aisese.ai",
  "DOWNLOAD_URL_PREFIX"
);

const ipaUrl = joinUrl(downloadUrlPrefix, formatTemplate(ipaFile));
const logoUrl = joinUrl(domain, formatTemplate(logoPath));
const qrCodeUrl = joinUrl(domain, "ios-install");
const plist = createManifestPlist({
  appName,
  appVersion,
  bundleIdentifier,
  ipaUrl,
  logoUrl
});
const hash = createHash("sha256").update(plist).digest("hex").slice(0, 12);
const manifestFileName = `manifest.${hash}.plist`;

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });

await Promise.all(staticFiles.map(copyStaticFile));
await fs.writeFile(path.join(distDir, "qrcode.png"), createQrCodePng(qrCodeUrl));
await fs.writeFile(path.join(distDir, manifestFileName), plist);
await fs.writeFile(path.join(distDir, "index.html"), await createIndexHtml(manifestFileName));

console.log(`Built dist/index.html`);
console.log(`Built dist/${manifestFileName}`);
console.log(`Built dist/qrcode.png for ${qrCodeUrl}`);
console.log(`IPA URL: ${ipaUrl}`);
console.log(`Logo URL: ${logoUrl}`);

async function copyStaticFile(fileName) {
  const from = path.join(rootDir, fileName);
  const to = path.join(distDir, fileName);

  try {
    await fs.copyFile(from, to);
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
}

async function createIndexHtml(manifestFileName) {
  const indexPath = path.join(rootDir, "index.html");
  const source = await fs.readFile(indexPath, "utf8");
  let html = source.replace(
    /<span class="version-badge">v[^<]+<\/span>/,
    `<span class="version-badge">v${escapeHtml(appVersion)}</span>`
  );

  html = html.replace(
    /new URL\("(?:__MANIFEST_FILE__|manifest(?:\.[a-f0-9]+)?\.plist)", window\.location\.href\)\.href/g,
    `new URL("${manifestFileName}", window.location.href).href`
  );

  if (!html.includes(manifestFileName)) {
    throw new Error("Build failed: index.html does not reference the hashed manifest file.");
  }

  return html;
}

function createManifestPlist({ appName, appVersion, bundleIdentifier, ipaUrl, logoUrl }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${escapeXml(ipaUrl)}</string>
        </dict>
        <dict>
          <key>kind</key>
          <string>display-image</string>
          <key>url</key>
          <string>${escapeXml(logoUrl)}</string>
        </dict>
        <dict>
          <key>kind</key>
          <string>full-size-image</string>
          <key>url</key>
          <string>${escapeXml(logoUrl)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${escapeXml(bundleIdentifier)}</string>
        <key>bundle-version</key>
        <string>${escapeXml(appVersion)}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${escapeXml(appName)}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;
}

function formatTemplate(value) {
  return value.replaceAll("{version}", appVersion).replaceAll("{appName}", appName);
}

function joinUrl(base, value) {
  return `${base.replace(/\/+$/, "")}/${value.replace(/^\/+/, "")}`;
}

function normalizeHttpsBase(value, name) {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`${name} cannot be empty.`);
  }

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`);
  }

  if (parsed.protocol !== "https:" || parsed.hostname === "") {
    throw new Error(`${name} must be an HTTPS URL.`);
  }

  return parsed.href.replace(/\/+$/, "");
}

function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`app.config.json field "${name}" is required.`);
  }

  return value.trim();
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function escapeHtml(value) {
  return escapeXml(value);
}
