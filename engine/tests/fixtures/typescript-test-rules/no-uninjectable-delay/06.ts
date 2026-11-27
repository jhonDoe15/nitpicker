const DELAY_MS = 1_000;
export function stop({ delayMs = DELAY_MS } = {}) { setTimeout(kill, delayMs); }