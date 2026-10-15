const HEADING = 'Notices (not failing):';

export function noticeSection(notices = []) {
  return notices.length === 0 ? [] : ['', HEADING, ...notices.map((notice) => `  ${notice}`)];
}

export function appendNoticeSummary(lines, notices, emphasize) {
  const [, heading, ...entries] = noticeSection(notices);
  if (heading !== undefined) {
    lines.push(emphasize(heading), ...entries);
  }
}
