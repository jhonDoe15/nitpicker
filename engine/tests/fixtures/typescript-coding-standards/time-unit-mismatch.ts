export const nowSecondsOk = () => (Date.now() / 1000) >>> 0;
export const aheadOk = (user: { exp: number }, timeoutMs: number) => user.exp > timeoutMs;
export const differOk = (showSeconds: boolean, showMs: boolean) => showSeconds !== showMs;
declare function formatSeconds(seconds: number): string;
declare function formatMillis(millis: number): string;
export const labelOk = (s: number, m: number) => formatSeconds(s) + formatMillis(m);
export const expiredOk = (payload: { exp: number }) => payload.exp * 1000 < Date.now();
export const deadlineOk = (ttlSeconds: number) => Date.now() + ttlSeconds * 1000;
export const leftOk = (timeoutMs: number, startedMs: number) => timeoutMs - (Date.now() - startedMs);
export const floorOk = () => Math.floor(Date.now() / 1000);
const MS_PER_SECOND = 1000;
export const toMsOk = (seconds: number) => seconds * MS_PER_SECOND;
export const textOk = (timeoutMs: number, timeoutSeconds: number) => 'ms ' + timeoutMs + ' s ' + timeoutSeconds;
export const ratioOk = (elapsedMs: number, budgetSeconds: number) => elapsedMs / (budgetSeconds * 1000);
export const laterOk = (date: Date, delayMs: number) => date.getTime() + delayMs;
export const pickOk = (fast: boolean, ms: number) => (fast ? ms : 0);
export const configOk = (ttlSeconds: number) => ({ ttlMs: ttlSeconds * 1000 });
export function waitOk(fn: () => void, delaySeconds: number) {
  setTimeout(fn, delaySeconds * 1000);
}
export const atOk = (payload: { exp: number }) => new Date(payload.exp * 1000);
export class LockOk {
  lockWaitTimeoutMillis = 5000;
}
export const readOk = ({ timeoutMs }: { timeoutMs: number }) => timeoutMs;
function retryOk(delayMs: number) {
  return delayMs;
}
export const goOk = (backoffMs: number) => retryOk(backoffMs);
export const truncOk = () => Math.trunc(Date.now() / 1000);
export const maskOk = (mask: number) => mask | 0;
export const wholeOk = (elapsedMs: number) => elapsedMs | 0;

export const expired = (payload: { exp: number }) => payload.exp < Date.now();
export const stale = (realm: { getMaxDeltaTimeSeconds(): number }) => Date.now() - realm.getMaxDeltaTimeSeconds();
export const deadline = (ttlSeconds: number) => Date.now() + ttlSeconds;
const started = Date.now();
export const late = (limitSeconds: number) => started > limitSeconds;
export const lateScaled = (delayMs: number) => Date.now() + delayMs * 1000;
export const tick = () => performance.now() > process.uptime();
export class Lock {
  lockWaitTimeoutMillis: number;
  constructor(waitSeconds: number) {
    this.lockWaitTimeoutMillis = waitSeconds;
  }
}
export const config = (ttlSeconds: number) => ({ ttlMs: ttlSeconds });
export const nowMsBad = () => {
  const nowMs = Date.now() / 1000;
  return nowMs;
};
export const readBad = ({ timeoutSeconds: timeoutMs }: { timeoutSeconds: number }) => timeoutMs;
export function wait(fn: () => void, delaySeconds: number) {
  setTimeout(fn, delaySeconds);
}
export const at = (payload: { exp: number }) => new Date(payload.exp);
export const go = (backoffSeconds: number) => retryOk(backoffSeconds);
export const abort = (limitSeconds: number) => AbortSignal.timeout(limitSeconds);
export const defaultBad = (pollMs = Date.now() / 1000 + 5 * 1000 * 1000 * 1000 * 1000 * 1000) => pollMs;
export const nowSeconds = () => (Date.now() / 1000) | 0;
export const stamp = () => ~~Date.now();
export const issued = (token: { iat: number }) => token.iat | 0;
export const stampUnsigned = () => Date.now() >>> 0;
