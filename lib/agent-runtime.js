function createEmptyBatchCounts(overrides = {}) {
    return {
        total: 0,
        queued: 0,
        running: 0,
        success: 0,
        error: 0,
        stopped: 0,
        completed: 0,
        ...overrides
    };
}

function createEmptyBatchState(overrides = {}) {
    const next = overrides && typeof overrides === 'object' ? overrides : {};
    return {
        running: false,
        stopRequested: false,
        jobId: '',
        providerId: '',
        providerName: '',
        providerFormat: '',
        model: '',
        prompt: '',
        concurrency: 1,
        maxRetries: 0,
        failureStrategy: 'skip',
        currentTaskId: '',
        exportFilePath: '',
        exportedAt: 0,
        counts: createEmptyBatchCounts(next.counts || {}),
        tasks: Array.isArray(next.tasks) ? next.tasks : [],
        ...next
    };
}

function createEmptyAgentRuntimeState(overrides = {}) {
    const next = overrides && typeof overrides === 'object' ? overrides : {};
    return {
        running: false,
        mode: 'idle',
        sessionId: '',
        profileId: '',
        profileName: '',
        providerId: '',
        providerName: '',
        providerFormat: '',
        model: '',
        pageUrl: '',
        events: Array.isArray(next.events) ? next.events : [],
        batch: createEmptyBatchState(next.batch || {}),
        ...next
    };
}

module.exports = {
    createEmptyAgentRuntimeState,
    createEmptyBatchCounts,
    createEmptyBatchState
};
