const YEAR_END = 4;
const MONTH_START = 5;
const MONTH_END = 7;
const DAY_START = 8;
const DATE_LENGTH = 10;

export function isValidDate(text: string): boolean {
  const year = Number(text.slice(0, YEAR_END));
  const month = Number(text.slice(MONTH_START, MONTH_END));
  const day = Number(text.slice(DAY_START, DATE_LENGTH));
  const time = Date.UTC(year, month - 1, day);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, DATE_LENGTH) === text;
}

export function isMonth(text: string): boolean {
  return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(text);
}

export function monthOf(date: string): string {
  return date.slice(0, MONTH_END);
}
