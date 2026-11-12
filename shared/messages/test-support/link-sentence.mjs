import { TROUBLESHOOTING_ANCHORS, troubleshootingSentence } from '../troubleshooting.mjs';

export function linkSentence(key) {
  const anchor = TROUBLESHOOTING_ANCHORS[key];
  if (anchor === undefined) {
    throw new Error(`No troubleshooting anchor named ${key}`);
  }
  return troubleshootingSentence(anchor);
}
