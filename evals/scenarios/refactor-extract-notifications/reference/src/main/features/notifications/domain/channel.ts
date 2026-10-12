import type { Message, Recipient } from './types.js';

const quietStartMinute = 22 * 60;
const quietEndMinute = 7 * 60;

function inQuietHours(now: string, utcOffsetMinutes: number): boolean {
  const local = new Date(Date.parse(now) + utcOffsetMinutes * 60_000).toISOString();
  const minuteOfDay = Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
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
