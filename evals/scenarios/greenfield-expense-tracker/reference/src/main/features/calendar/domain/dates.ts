export function isValidDate(text: string): boolean {
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  const time = Date.UTC(year, month - 1, day);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

export function isMonth(text: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(text);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}
