const path = require('path');
const {
    BROWSER_NAME,
    DEFAULT_CONFIG_RELATIVE_PATH,
    ensureBundledBrowser,
    getInstalledBrowserVersion
} = require('../lib/browser-download');

async function main() {
    const baseDir = path.resolve(__dirname, '..');
    const executablePath = await ensureBundledBrowser(baseDir);
    const version = await getInstalledBrowserVersion(baseDir);
    console.log(`${BROWSER_NAME} ${version || 'unknown'} ready: ${executablePath}`);
}

main().catch((error) => {
    console.error(`Failed to prepare ${BROWSER_NAME}. The app now defaults to official Chromium snapshots. You can also stage a local browser with "npm run browser:stage -- --source <zip-or-dir> --version <version>", or configure ${DEFAULT_CONFIG_RELATIVE_PATH} / XBROWSER_BROWSER_* env vars.`, error);
    process.exitCode = 1;
});
