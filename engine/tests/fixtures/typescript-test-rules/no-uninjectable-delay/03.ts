const DELAY_MS = 2 * 1000;
function stop(child) { child.on("close", () => { setTimeout(() => kill(child), DELAY_MS).unref(); }); }
export { stop };