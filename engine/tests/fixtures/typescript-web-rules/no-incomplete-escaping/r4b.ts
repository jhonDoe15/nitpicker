export const a = (s: string) => s.replace(/"|\P{ASCII}/u, '\\\udc00');
