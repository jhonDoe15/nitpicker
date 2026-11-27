const POLL_MS = 500;
export const watch = (child) => { return setInterval(() => poll(child), POLL_MS); };