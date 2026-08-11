import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GOOGLE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700&display=swap';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CLIENT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_FONTS_DIR = path.join(CLIENT_ROOT, 'public', 'fonts');
const FONTS_CSS_PATH = path.join(CLIENT_ROOT, 'src', 'styles', 'fonts.css');

function fetchUrl(url, headers = {}) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close();
                fs.unlink(destPath, () => {});
                return downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
            }
            res.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
        });
    });
}

async function start() {
    console.log('Fetching Google Fonts CSS...');
    const css = await fetchUrl(GOOGLE_FONTS_URL, { 'User-Agent': USER_AGENT });

    // Parse the CSS blocks
    const fontFaceRegex = /@font-face\s*\{[^}]*\}/g;
    const blocks = css.match(fontFaceRegex) || [];
    console.log(`Found ${blocks.length} font-face blocks.`);

    let localCss = '\n/* --- Local Fonts (Inter & Newsreader) --- */\n';

    for (let block of blocks) {
        // Extract font-family
        const familyMatch = block.match(/font-family:\s*['"]?([^'"]+)['"]?/);
        if (!familyMatch) continue;
        const family = familyMatch[1];
        const familyKey = family.toLowerCase().replace(/\s+/g, '-');

        // Extract URL
        const urlMatch = block.match(/url\((https:\/\/[^)]+)\)/);
        if (!urlMatch) continue;
        const url = urlMatch[1];

        // Determine local filename
        const urlParts = url.split('/');
        const originalFilename = urlParts[urlParts.length - 1];
        const destDir = path.join(PUBLIC_FONTS_DIR, familyKey);
        
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        const destPath = path.join(destDir, originalFilename);
        const relativeUrl = `/fonts/${familyKey}/${originalFilename}`;

        console.log(`Downloading ${family} font file: ${originalFilename}...`);
        await downloadFile(url, destPath);

        // Replace remote URL with local URL in block
        const localBlock = block.replace(/url\([^)]+\)/, `url('${relativeUrl}')`);
        localCss += localBlock + '\n\n';
    }

    console.log('Appending local font-face definitions to fonts.css...');
    fs.appendFileSync(FONTS_CSS_PATH, localCss);
    console.log('Done downloading and updating fonts.css.');
}

start().catch(console.error);
