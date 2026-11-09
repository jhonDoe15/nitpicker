import { rule } from '../no-uncoerced-request-input.mjs';

function escaped(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

export function expectedError(messageId, data = {}) {
  const template = rule.meta.messages[messageId];
  const parts = template.split(/(\{\{\w+\}\})/u).map((part) => {
    const name = /^\{\{(\w+)\}\}$/u.exec(part)?.[1];
    if (name === undefined) {
      return escaped(part);
    }
    return Object.hasOwn(data, name) ? escaped(data[name]) : '.+';
  });
  return { message: new RegExp(`^${parts.join('')}$`, 'u') };
}
