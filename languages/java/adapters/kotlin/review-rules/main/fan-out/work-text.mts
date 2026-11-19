import type { WorkText } from './typed/fan-out-types.mts';
import { MESSAGE_KIND } from './clients.mts';

export function target(kind: string): string {
  return kind === MESSAGE_KIND ? 'broker' : 'remote service';
}

export function workText({ call, helper }: WorkText): string {
  return helper === undefined ? `\`${call}\`` : `\`${helper}\`, which reaches \`${call}\`,`;
}
