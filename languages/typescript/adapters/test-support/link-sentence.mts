import { linkSentence as untypedLinkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';

export function linkSentence(key: string): string {
  const sentence: unknown = untypedLinkSentence(key);
  if (typeof sentence !== 'string') {
    throw new TypeError(`No troubleshooting sentence for ${key}`);
  }
  return sentence;
}
