const BASE_MS = 400;
export function stop() { globalThis.setTimeout(kill, BASE_MS * 2); }