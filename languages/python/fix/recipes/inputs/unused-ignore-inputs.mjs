import { realpathSync } from 'node:fs';
import path from 'node:path';
import { createSnapshot } from '../../../../../core/fix/engine/edits/snapshot.mjs';
import { runMypy, resolveTypeChecker } from '../../../adapters/python-types.mjs';
import { ingestMypy } from '../../../ingest/type-check.mts';

const RULE = 'unused-ignore';

export function unusedIgnoreInputs(context, files) {
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
  const grouped = {};
  for (const { path: name, location, message } of found) {
    grouped[name] ??= { text: texts.get(name), ignores: [] };
    grouped[name].ignores.push({ line: location.line, message });
  }
  return grouped;
}
