import { setTimeout as sleep } from 'node:timers/promises';
const SETTLE_MS = 750;
export async function settle(handle) { await sleep(SETTLE_MS); return handle; }