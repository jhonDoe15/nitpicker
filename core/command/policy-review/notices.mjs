import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mjs';

const TYPESCRIPT_PRESETS = new Set([undefined, 'typescript']);

export function noticeDescriber(config, headPolicy) {
  return TYPESCRIPT_PRESETS.has(config.preset)
    ? (changedFiles) => outsideRootsNotices(changedFiles, headPolicy)
    : undefined;
}
