export const a = (s: string) => s.replace(/\\"/g, '"').replace(/(?<=\1(.))/, '\\');
