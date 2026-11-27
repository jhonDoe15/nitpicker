const MAP: Record<string, string> = { '.*': '%' };
export function param(re: RegExp) { return re.source.replace(/^\^/, '').replace(/\$$/, '').replace(/\.\*|[.!%_]/g, (match) => MAP[match] ?? match); }