import { smsNumber } from './channel.js';
import { formatDate, formatMoney } from './format.js';
import type { Message, Recipient } from './types.js';

type Wording = {
  readonly subject: string;
  readonly body: string;
  readonly text: string;
};

function deliver(recipient: Recipient, now: string, wording: Wording): Message {
  const phone = smsNumber(recipient, now);
  if (phone !== undefined) {
    return { channel: 'sms', to: phone, text: wording.text };
  }
  return {
    channel: 'email',
    to: recipient.email,
    subject: wording.subject,
    body: wording.body,
  };
}

export function receiptMessage(input: {
  readonly recipient: Recipient;
  readonly now: string;
  readonly heading: string;
  readonly lines: readonly string[];
  readonly totalCents: number;
}): Message {
  const { recipient, now, heading } = input;
  const total = formatMoney(input.totalCents);
  const issued = formatDate(now, recipient.utcOffsetMinutes);
  return deliver(recipient, now, {
    subject: `Receipt: ${heading}`,
    body: `Hi ${recipient.name},\n\n${input.lines.join('\n')}\n\nTotal: ${total}\nIssued ${issued}\n`,
    text: `${heading}: total ${total} (${issued})`,
  });
}

export function reminderMessage(input: {
  readonly recipient: Recipient;
  readonly now: string;
  readonly heading: string;
  readonly text: string;
  readonly dueAt: string;
}): Message {
  const { recipient, now, heading, text } = input;
  const due = formatDate(input.dueAt, recipient.utcOffsetMinutes);
  const sent = formatDate(now, recipient.utcOffsetMinutes);
  return deliver(recipient, now, {
    subject: `Reminder: ${heading}`,
    body: `Hi ${recipient.name},\n\n${text}\n\nDue ${due}\nSent ${sent}\n`,
    text: `${heading}: ${text} (due ${due})`,
  });
}
