import { outsideRootsNotices } from '../../../languages/typescript/preset/notices/outside-roots-notice.mjs';

const TYPESCRIPT_PRESETS = new Set([undefined, 'typescript']);

export function policyNotices(headPolicy) {
  return headPolicy.tools?.tests?.notices ?? [];
}

export function noticeDescriber(config, headPolicy) {
  const notices = policyNotices(headPolicy);
  if (TYPESCRIPT_PRESETS.has(config.preset)) {
    return (changedFiles) => [...notices, ...outsideRootsNotices(changedFiles, headPolicy)];
  }
  return notices.length === 0 ? undefined : () => notices;
}
