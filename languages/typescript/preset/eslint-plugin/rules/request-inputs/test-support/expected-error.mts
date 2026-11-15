import { rule } from '../no-uncoerced-request-input.mjs';

function escaped(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

const messages: Record<string, string> = rule.meta.messages;

export function expectedError(
  messageId: string,
  data: Record<string, string> = {},
): { message: RegExp } {
  const template = messages[messageId] ?? '';
  const parts = template.split(/(\{\{\w+\}\})/u).map((part: string) => {
    const name = /^\{\{(\w+)\}\}$/u.exec(part)?.[1];
    if (name === undefined) {
      return escaped(part);
    }
    return Object.hasOwn(data, name) ? escaped(data[name] ?? '') : '.+';
  });
  return { message: new RegExp(['^', ...parts, '$'].join(''), 'u') };
}
