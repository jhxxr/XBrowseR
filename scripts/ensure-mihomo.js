const path = require('path');
const { ensureBundledMihomo, resolveLatestMihomoRelease } = require('../lib/mihomo-download');

async function main() {
    const baseDir = path.resolve(__dirname, '..');
    const release = await resolveLatestMihomoRelease();
    const binaryPath = await ensureBundledMihomo(baseDir);
    console.log(`Mihomo ${release.version} ready: ${binaryPath}`);
}

main().catch((error) => {
    console.error('Failed to prepare Mihomo:', error);
    process.exitCode = 1;
});
