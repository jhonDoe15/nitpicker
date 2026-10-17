import type { Message, Recipient } from './types.js';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;
const quietStartMinute = 22 * MINUTES_PER_HOUR;
const quietEndMinute = 7 * MINUTES_PER_HOUR;
const HOUR_START = 11;
const HOUR_END = 13;
const MINUTE_START = 14;
const MINUTE_END = 16;

function inQuietHours(now: string, utcOffsetMinutes: number): boolean {
  const local = new Date(Date.parse(now) + utcOffsetMinutes * MS_PER_MINUTE).toISOString();
  const hour = Number(local.slice(HOUR_START, HOUR_END));
  const minute = Number(local.slice(MINUTE_START, MINUTE_END));
  const minuteOfDay = hour * MINUTES_PER_HOUR + minute;
  return minuteOfDay >= quietStartMinute || minuteOfDay < quietEndMinute;
}

export function smsNumber(recipient: Recipient, now: string): string | undefined {
  const { phone } = recipient;
  if (recipient.preferredChannel !== 'sms' || phone === undefined || phone.trim() === '') {
    return undefined;
  }
  return inQuietHours(now, recipient.utcOffsetMinutes) ? undefined : phone;
}

export function chooseChannel(recipient: Recipient, now: string): Message['channel'] {
  return smsNumber(recipient, now) === undefined ? 'email' : 'sms';
}
