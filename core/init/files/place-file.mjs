import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectFileText, writableProjectFile } from '../support/inside-project.mjs';
import { unifiedDiff } from './line-diff.mjs';

const DIFFERS = 'It differs from what init would write.';

function normalized(text) {
  const lines = text.replaceAll('\r\n', '\n');
  return lines === '' || lines.endsWith('\n') ? lines : `${lines}\n`;
}

function sameText(content) {
  return (current) => (current === content ? undefined : { after: content, reason: DIFFERS });
}

export function placeFile({ root, relative, content, revise = sameText(content) }) {
  const existing = projectFileText(root, relative);
  if (existing === undefined) {
    const file = writableProjectFile(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return { relative, status: 'created' };
  }
  const current = normalized(existing);
  const revision = revise(current);
  if (revision === undefined) {
    return { relative, status: 'unchanged' };
  }
  return {
    relative,
    status: 'differs',
    reason: revision.reason,
    diff: unifiedDiff({ name: relative, before: current, after: revision.after }),
  };
}
