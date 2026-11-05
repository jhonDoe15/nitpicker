import { MESSAGE_KIND } from './clients.mjs';

export function target(kind) {
  return kind === MESSAGE_KIND ? 'broker' : 'remote service';
}

export function workText({ call, helper }) {
  return helper === undefined ? `\`${call}\`` : `\`${helper}\`, which reaches \`${call}\`,`;
}
