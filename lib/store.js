const path = require('path');
const fs = require('fs-extra');

function createStore(baseDir) {
    const dataDir = path.join(baseDir, 'data');
    const profilesFile = path.join(dataDir, 'profiles.json');
    const settingsFile = path.join(dataDir, 'settings.json');
    const runtimeDir = path.join(dataDir, 'runtime');

    fs.ensureDirSync(dataDir);
    fs.ensureDirSync(runtimeDir);

    const defaultSettings = {
        proxies: [],
        subscriptions: [],
        api: {
            enabled: true,
            port: 23919
        },
        ui: {
            activeView: 'home'
        }
    };

    async function readJson(file, fallback) {
        if (!(await fs.pathExists(file))) {
            return fallback;
        }
        try {
            return await fs.readJson(file);
        } catch (error) {
            return fallback;
        }
    }

    return {
        dataDir,
        runtimeDir,
        profilesFile,
        settingsFile,
        async loadProfiles() {
            return readJson(profilesFile, []);
        },
        async saveProfiles(profiles) {
            await fs.writeJson(profilesFile, profiles, { spaces: 2 });
        },
        async loadSettings() {
            const settings = await readJson(settingsFile, defaultSettings);
            return {
                ...defaultSettings,
                ...settings,
                api: { ...defaultSettings.api, ...(settings.api || {}) },
                ui: { ...defaultSettings.ui, ...(settings.ui || {}) }
            };
        },
        async saveSettings(settings) {
            await fs.writeJson(settingsFile, settings, { spaces: 2 });
        }
    };
}

module.exports = { createStore };
