import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { insideProject, writableProjectFile } from '../support/inside-project.mjs';
import { unifiedDiff } from './line-diff.mjs';

const DIFFERS = 'It differs from what init would write.';

function withLineFeeds(text) {
  return text.replaceAll('\r\n', '\n');
}

function sameText(content) {
  return (current) => (current === content ? undefined : { after: content, reason: DIFFERS });
}

export function placeFile({ root, relative, content, revise = sameText(content) }) {
  const file = insideProject(root, relative);
  if (!existsSync(file)) {
    writableProjectFile(root, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return { relative, status: 'created' };
  }
  const current = withLineFeeds(readFileSync(file, 'utf8'));
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
