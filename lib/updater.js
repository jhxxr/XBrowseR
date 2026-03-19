const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const INITIAL_UPDATE_DELAY_MS = 15 * 1000;

function createEmptyUpdaterState() {
    return {
        supported: false,
        enabled: false,
        status: 'idle',
        currentVersion: app.getVersion(),
        availableVersion: '',
        downloadedVersion: '',
        releaseName: '',
        releaseDate: '',
        progress: 0,
        bytesPerSecond: 0,
        transferred: 0,
        total: 0,
        checkedAt: 0,
        downloadedAt: 0,
        canRestartToUpdate: false,
        message: '',
        error: ''
    };
}

function createUpdaterController(options = {}) {
    const { onStateChanged } = options;

    const state = createEmptyUpdaterState();
    let initialized = false;
    let intervalHandle = null;
    let startupTimer = null;

    const notify = () => {
        if (typeof onStateChanged === 'function') {
            onStateChanged();
        }
    };

    const mergeState = (patch = {}) => {
        Object.assign(state, patch);
        notify();
    };

    const stopTimers = () => {
        if (startupTimer) {
            clearTimeout(startupTimer);
            startupTimer = null;
        }
        if (intervalHandle) {
            clearInterval(intervalHandle);
            intervalHandle = null;
        }
    };

    const isSupported = () => process.platform === 'win32' && app.isPackaged;

    const attachListeners = () => {
        autoUpdater.on('checking-for-update', () => {
            mergeState({
                supported: true,
                enabled: true,
                status: 'checking',
                checkedAt: Date.now(),
                progress: 0,
                bytesPerSecond: 0,
                transferred: 0,
                total: 0,
                canRestartToUpdate: false,
                message: '正在后台检查更新',
                error: ''
            });
        });

        autoUpdater.on('update-available', (info) => {
            mergeState({
                supported: true,
                enabled: true,
                status: 'available',
                availableVersion: String(info?.version || ''),
                downloadedVersion: '',
                releaseName: String(info?.releaseName || ''),
                releaseDate: String(info?.releaseDate || ''),
                progress: 0,
                message: `发现新版本 v${String(info?.version || '').trim() || '?' }，正在后台下载`,
                error: ''
            });
        });

        autoUpdater.on('update-not-available', () => {
            mergeState({
                supported: true,
                enabled: true,
                status: 'idle',
                availableVersion: '',
                downloadedVersion: '',
                releaseName: '',
                releaseDate: '',
                progress: 0,
                bytesPerSecond: 0,
                transferred: 0,
                total: 0,
                checkedAt: Date.now(),
                canRestartToUpdate: false,
                message: '',
                error: ''
            });
        });

        autoUpdater.on('download-progress', (progress) => {
            mergeState({
                supported: true,
                enabled: true,
                status: 'downloading',
                progress: Math.max(0, Math.min(100, Math.round(Number(progress?.percent) || 0))),
                bytesPerSecond: Number(progress?.bytesPerSecond) || 0,
                transferred: Number(progress?.transferred) || 0,
                total: Number(progress?.total) || 0,
                message: `新版本 v${state.availableVersion || '?'} 正在后台下载`,
                error: ''
            });
        });

        autoUpdater.on('update-downloaded', (info) => {
            mergeState({
                supported: true,
                enabled: true,
                status: 'downloaded',
                availableVersion: String(info?.version || ''),
                downloadedVersion: String(info?.version || ''),
                releaseName: String(info?.releaseName || ''),
                releaseDate: String(info?.releaseDate || ''),
                progress: 100,
                downloadedAt: Date.now(),
                canRestartToUpdate: true,
                message: `新版本 v${String(info?.version || '').trim() || '?'} 已下载完成，退出应用时会自动安装`,
                error: ''
            });
        });

        autoUpdater.on('before-quit-for-update', () => {
            mergeState({
                supported: true,
                enabled: true,
                status: 'installing',
                canRestartToUpdate: false,
                message: '正在安装更新'
            });
        });

        autoUpdater.on('error', (error) => {
            mergeState({
                supported: true,
                enabled: true,
                status: 'error',
                checkedAt: Date.now(),
                canRestartToUpdate: false,
                message: '',
                error: error?.message || String(error || '自动更新失败')
            });
        });
    };

    const scheduleChecks = () => {
        stopTimers();
        startupTimer = setTimeout(() => {
            checkForUpdates().catch(() => {});
        }, INITIAL_UPDATE_DELAY_MS);
        intervalHandle = setInterval(() => {
            checkForUpdates().catch(() => {});
        }, UPDATE_CHECK_INTERVAL_MS);
    };

    async function initialize() {
        if (initialized) {
            return state;
        }

        initialized = true;

        if (!isSupported()) {
            mergeState({
                supported: false,
                enabled: false,
                status: app.isPackaged ? 'unsupported' : 'development',
                message: '',
                error: ''
            });
            return state;
        }

        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.allowDowngrade = false;
        autoUpdater.allowPrerelease = /\-/.test(app.getVersion());
        attachListeners();

        mergeState({
            supported: true,
            enabled: true,
            status: 'idle',
            message: '',
            error: ''
        });

        scheduleChecks();
        return state;
    }

    async function checkForUpdates() {
        if (!initialized || !state.enabled) {
            return state;
        }

        if (state.status === 'checking' || state.status === 'downloading' || state.status === 'downloaded' || state.status === 'installing') {
            return state;
        }

        try {
            await autoUpdater.checkForUpdates();
        } catch (error) {
            mergeState({
                supported: true,
                enabled: true,
                status: 'error',
                checkedAt: Date.now(),
                canRestartToUpdate: false,
                message: '',
                error: error?.message || String(error || '自动更新失败')
            });
        }

        return state;
    }

    async function installUpdate() {
        if (state.status !== 'downloaded' || !state.canRestartToUpdate) {
            return false;
        }
        autoUpdater.quitAndInstall(true, true);
        return true;
    }

    app.on('quit', stopTimers);

    return {
        initialize,
        checkForUpdates,
        installUpdate,
        getState() {
            return { ...state };
        }
    };
}

module.exports = {
    createEmptyUpdaterState,
    createUpdaterController
};
