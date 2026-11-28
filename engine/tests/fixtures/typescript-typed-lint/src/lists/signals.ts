type Tool = { status: string; id: string };
declare function stopAgent(): void;
declare function markDone(): void;

export function signals(tools: Tool[], readonlyTools: readonly Tool[], pair: [Tool, Tool], maybe: Tool[] | undefined) {
  const allDone = tools.every((tool) => tool.status === "x");
  const everyReady = readonlyTools.every((tool) => tool.id !== "");
  const tupleDone = pair.every((tool) => tool.id !== "");
  const optionalDone = maybe?.every((tool) => tool.id !== "");
  const guardedAll = tools.length > 0 && tools.every((tool) => tool.id !== "");
  const plain = tools.every((tool) => tool.id !== "");
  if (tools.every((tool) => tool.status === "x")) {
    markDone();
  }
  return tools.filter((tool) => tool.id).every((tool) => tool.status === "x") ? stopAgent() : [allDone, everyReady, tupleDone, optionalDone, guardedAll, plain];
}

export function holder(state: { items: Tool[] }) {
  const finished = { allCancelled: state.items.every((item) => item.id !== "") };
  if (state.items.every((item) => item.id !== "")) {
    stopAgent();
  }
  return finished;
}
