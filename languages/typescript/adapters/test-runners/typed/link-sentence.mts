import { linkSentence as untypedLinkSentence } from '../../../../../shared/messages/test-support/link-sentence.mjs';
import { textOf } from '../../../../../shared/values/readers.mts';

export function linkSentence(key: string): string {
  const sentence: unknown = untypedLinkSentence(key);
  return textOf(sentence);
}
