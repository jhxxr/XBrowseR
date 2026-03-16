const path = require('path');
const { ensureBundledBrowser, getInstalledBrowserVersion, CFT_CHANNEL } = require('../lib/browser-download');

async function main() {
    const baseDir = path.resolve(__dirname, '..');
    const executablePath = await ensureBundledBrowser(baseDir);
    const version = await getInstalledBrowserVersion(baseDir);
    console.log(`Chrome for Testing ${version || 'unknown'} (${CFT_CHANNEL}) ready: ${executablePath}`);
}

main().catch((error) => {
    console.error('Failed to prepare bundled browser:', error);
    process.exitCode = 1;
});
