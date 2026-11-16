import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { ToolContext } from '../../../adapters/typed/context/tool-context-types.mts';
import type { NamedFile, UnusedIgnore } from '../../typed/fix-types.mts';
import { createSnapshot } from '../../typed/core-views.mts';
import { runMypy, resolveTypeChecker } from '../../../adapters/python-types.mts';
import { ingestMypy } from '../../../ingest/type-check.mts';

const RULE = 'unused-ignore';

export function unusedIgnoreInputs(
  context: ToolContext,
  files: readonly NamedFile[],
): Record<string, { text: string | undefined; ignores: UnusedIgnore[] }> {
  if (resolveTypeChecker(context) !== 'mypy') {
    return {};
  }
  const { projectRoot } = context;
  const roots = [...new Set([path.resolve(projectRoot), realpathSync(projectRoot)])];
  const snapshot = createSnapshot(
    projectRoot,
    files.map(({ path: name }) => name),
  );
  const texts = new Map(snapshot.files.map(({ path: name, text }) => [name, text]));
  const found = ingestMypy(runMypy(context).stdout, { roots }).filter(
    ({ rule, path: name }) => rule === RULE && texts.has(name),
  );
  const grouped: Record<string, { text: string | undefined; ignores: UnusedIgnore[] }> = {};
  for (const { path: name, location, message } of found) {
    const entry = grouped[name] ?? { text: texts.get(name), ignores: [] };
    grouped[name] = entry;
    entry.ignores.push({ line: location?.line, message });
  }
  return grouped;
}
