export const a = (s: string) => s.replace(/"|[^\P{Lu}]/iv, '\\a');
