import { TROUBLESHOOTING_ANCHORS, troubleshootingSentence } from '../troubleshooting.mts';

export function linkSentence(key: string): string | undefined {
  const anchor = Object.entries(TROUBLESHOOTING_ANCHORS).find(([name]) => name === key)?.[1];
  if (anchor === undefined) {
    throw new Error(`No troubleshooting anchor named ${key}`);
  }
  return troubleshootingSentence(anchor);
}
