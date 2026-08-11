import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readText = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(readText('../public/manifest.webmanifest'));
const indexHtml = readText('../index.html');
const serviceWorker = readText('../public/sw.js');
const pwaExperience = readText('../src/components/pwa/PwaExperience.jsx');
const registerServiceWorker = readText('../src/components/pwa/registerServiceWorker.js');
const useInstallPrompt = readText('../src/components/pwa/useInstallPrompt.js');
const useOnlineStatus = readText('../src/components/pwa/useOnlineStatus.js');
const packageJson = JSON.parse(readText('../package.json'));
const viteConfig = readText('../vite.config.js');

assert.equal(manifest.id, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.match(manifest.start_url, /^\//);
assert.equal(manifest.prefer_related_applications, false);

const iconByPurposeAndSize = new Map(
  manifest.icons.map((icon) => [`${icon.purpose}:${icon.sizes}`, icon]),
);

for (const purpose of ['any', 'maskable']) {
  for (const size of [192, 512]) {
    const icon = iconByPurposeAndSize.get(`${purpose}:${size}x${size}`);
    assert.ok(icon, `Falta icono ${purpose} ${size}x${size}`);
    assert.equal(icon.type, 'image/png');

    const png = readFileSync(new URL(`../public${icon.src}`, import.meta.url));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
}

assert.match(indexHtml, /rel="manifest" href="\/manifest\.webmanifest"/);
assert.match(indexHtml, /rel="apple-touch-icon"/);
assert.match(serviceWorker, /event\.request\.mode === 'navigate'/);
assert.doesNotMatch(serviceWorker, /\bcaches\./);
assert.doesNotMatch(serviceWorker, /\/api|\/json|\/card_images|\/card_audio/);
assert.match(pwaExperience, /registerPwaServiceWorker/);
assert.match(registerServiceWorker, /serviceWorker\.register\('\/sw\.js'/);
assert.match(useInstallPrompt, /beforeinstallprompt/);
assert.match(useOnlineStatus, /addEventListener\('offline'/);
assert.match(packageJson.scripts['preview:pwa'], /localhost.*4173.*strictPort/);
assert.match(viteConfig, /preview:\s*\{/);
assert.match(viteConfig, /proxy:\s*backendProxy/);
assert.match(viteConfig, /Referrer-Policy.*no-referrer-when-downgrade/);

console.log('PWA online-first contract: OK');
