export const a = (s: string) => s.replace(/"|\P{ASCII}/iv, '\\k');
