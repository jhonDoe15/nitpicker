import pRetry from 'p-retry';
await pRetry(() => fetch(url, { method: 'POST' }));
export {};
