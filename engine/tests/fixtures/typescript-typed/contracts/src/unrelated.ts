const other = { remove(): void {}, stop(): void {}, __reset(): void {} };
other.remove();
other.stop();
other.__reset();
export const { sleep, ...rest } = { sleep: 1, stop: 2 };
