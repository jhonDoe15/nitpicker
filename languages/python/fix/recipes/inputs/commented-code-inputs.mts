import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { ToolContext } from '../../../adapters/typed/context/tool-context-types.mts';
import type { CommentedCode, NamedFile } from '../../typed/fix-types.mts';
import { lintOptions } from '../../../adapters/python-tools.mts';
import { run } from '../../../adapters/execution/python-process.mts';
import { createSnapshot } from '../../typed/core-views.mts';

type RuffDiagnostic = {
  readonly code?: string;
  readonly filename: string;
  readonly location: { readonly row: number };
};

const parseDiagnostics: (text: string) => RuffDiagnostic[] = JSON.parse;
const RULE_CODE = 'ERA001';
const PYTHON_SOURCE = /\.py$/u;

function diagnosticsOf(context: ToolContext, names: readonly string[]): RuffDiagnostic[] {
  const { stdout } = run(
    context,
    [
      'ruff',
      'check',
      ...lintOptions(context),
      '--select',
      RULE_CODE,
      '--no-fix',
      '--output-format',
      'json',
      '--force-exclude',
      '--',
      ...names,
    ],
    { accepted: [0, 1], rule: 'ruff-failed' },
  );
  return parseDiagnostics(stdout);
}

export function commentedCodeInputs(
  context: ToolContext,
  files: readonly NamedFile[],
): Record<string, CommentedCode> {
  const { projectRoot } = context;
  const names = files.map(({ path: name }) => name).filter((name) => PYTHON_SOURCE.test(name));
  if (names.length === 0) {
    return {};
  }
  const texts = new Map(
    createSnapshot(projectRoot, names).files.map(({ path: name, text }) => [name, text]),
  );
  const roots = [...new Set([path.resolve(projectRoot), realpathSync(projectRoot)])];
  const grouped: Record<string, CommentedCode> = {};
  for (const { code, filename, location } of diagnosticsOf(context, names)) {
    const name = roots
      .map((root) => path.relative(root, filename).split(path.sep).join('/'))
      .find((candidate) => texts.has(candidate));
    const text = name === undefined ? undefined : texts.get(name);
    if (code === RULE_CODE && name !== undefined && text !== undefined) {
      (grouped[name] ??= { text, lines: [] }).lines.push(location.row);
    }
  }
  return grouped;
}
