const path = require('path');
const { ensureBundledMihomo, MIHOMO_VERSION } = require('../lib/mihomo-download');

async function main() {
    const baseDir = path.resolve(__dirname, '..');
    const binaryPath = await ensureBundledMihomo(baseDir);
    console.log(`Mihomo ${MIHOMO_VERSION} ready: ${binaryPath}`);
}

main().catch((error) => {
    console.error(`Failed to prepare Mihomo ${MIHOMO_VERSION}:`, error);
    process.exitCode = 1;
});
