const path = require('path');
const { ensureBundledBrowser, resolveChromeDownload, CFT_CHANNEL } = require('../lib/browser-download');

async function main() {
    const baseDir = path.resolve(__dirname, '..');
    const download = await resolveChromeDownload();
    const executablePath = await ensureBundledBrowser(baseDir);
    console.log(`Chrome for Testing ${download.version} (${CFT_CHANNEL}) ready: ${executablePath}`);
}

main().catch((error) => {
    console.error('Failed to prepare bundled browser:', error);
    process.exitCode = 1;
});
