import dayjs from 'dayjs';
import { format, startOfDay } from 'date-fns';
import { DateTime } from 'luxon';

export const year = (date: Date) => date.getFullYear();
export const utcYear = (date: Date) => date.getUTCFullYear();
export const hour = (date?: Readonly<Date>) => date?.getHours();
export const offset = (date: Date) => date.getTimezoneOffset();
export const label = (date: Date) => date.toLocaleDateString('en-US');
export const pinned = (date: Date) => date.toLocaleDateString('en-US', { timeZone: 'UTC' });
export const text = (date: Date) => date.toString();
export const number = (value: number) => value.toLocaleString('en-US');

class Calendar {
  getMonth() {
    return 1;
  }
}
export const month = (calendar: Calendar) => calendar.getMonth();

export const formatter = new Intl.DateTimeFormat('en-US');
export const pinnedFormatter = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' });
export const serverZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const built = new Date(2024, 0, 1);
export const parsed = new Date('2024-01-01T10:00');
export const parsedWithOffset = new Date('2024-01-01T10:00:00Z');
export const stamp = Date.parse('2024-01-01 10:00:00');

export const now = () => DateTime.now();
export const utcNow = () => DateTime.now().setZone('utc');
export const day = (date: Date) => format(date, 'yyyy-MM-dd');
export const start = (date: Date) => startOfDay(date);
export const today = () => dayjs().format('YYYY-MM-DD');
export const instant = () => dayjs().valueOf();
