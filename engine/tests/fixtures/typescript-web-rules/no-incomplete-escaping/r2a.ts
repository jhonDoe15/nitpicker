export const a = (s: string) => s.replace(/\\"/g, '"').replace(/[\q{\\}]{2}/v, '\\');
