const path = require('path');
const { ensureBundledMihomo, getInstalledMihomoVersion } = require('../lib/mihomo-download');

async function main() {
    const baseDir = path.resolve(__dirname, '..');
    const binaryPath = await ensureBundledMihomo(baseDir);
    const version = await getInstalledMihomoVersion(baseDir);
    console.log(`Mihomo ${version || 'unknown'} ready: ${binaryPath}`);
}

main().catch((error) => {
    console.error('Failed to prepare Mihomo:', error);
    process.exitCode = 1;
});
