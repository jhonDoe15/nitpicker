import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { insideProject } from '../support/inside-project.mjs';
import { unifiedDiff } from './line-diff.mjs';

export function placeFile({ root, relative, content, isEquivalent = (text) => text === content }) {
  const file = insideProject(root, relative);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return { relative, status: 'created' };
  }
  const current = readFileSync(file, 'utf8');
  if (isEquivalent(current)) {
    return { relative, status: 'unchanged' };
  }
  return {
    relative,
    status: 'differs',
    diff: unifiedDiff({ name: relative, before: current, after: content }),
  };
}
