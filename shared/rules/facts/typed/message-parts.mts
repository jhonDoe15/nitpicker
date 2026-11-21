import { messageFields, type MessageValues } from '../../../messages/messages.mts';
import { MESSAGES } from '../../../policy.mts';

export type MessageParts = Readonly<Record<string, string>> & { readonly message: string };

export function messageParts(template: string, values: MessageValues): MessageParts {
  const { message, ...rest } = messageFields(template, values);
  return { message, ...rest };
}

const TEMPLATES: Readonly<Record<string, string>> = MESSAGES;

export function messageTemplate(key: string): string {
  const template = TEMPLATES[key];
  if (template === undefined) {
    throw new TypeError(`"${key}" is not a message key`);
  }
  return template;
}
