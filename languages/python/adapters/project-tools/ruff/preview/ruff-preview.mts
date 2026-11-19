import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  fieldOf,
  isPlainObject,
  listOf,
  parseJson,
} from '../../../../../../shared/values/readers.mts';
import {
  ruffPreviewSelections,
  type PreviewRule,
} from '../../../configuration/python-ruff-config.mts';
import { run } from '../../../execution/python-process.mts';
import { resolveInside as untypedResolveInside } from '../../../../../../shared/conventions/read-inside.mjs';
import type { ToolContext } from '../../../typed/context/tool-context-types.mts';

const PREVIEW_REPORT = 'ruff-preview.sarif';

const resolveInside: (root: string, relative: string) => string | undefined = untypedResolveInside;

function previewCheckArguments(
  options: readonly string[],
  { rules, reportRoot }: { readonly rules: readonly PreviewRule[]; readonly reportRoot: string },
): string[] {
  return [
    'ruff',
    'check',
    ...options,
    '--preview',
    '--select',
    rules.map(({ code }) => code).join(','),
    '--output-format',
    'sarif',
    '--output-file',
    path.join(reportRoot, PREVIEW_REPORT),
    '.',
  ];
}

function firstRun(log: unknown): Record<string, unknown> | undefined {
  const run = listOf(fieldOf(log, 'runs'))[0];
  return isPlainObject(run) ? run : undefined;
}

function driverRules(run: Record<string, unknown>): unknown[] {
  return [...listOf(fieldOf(fieldOf(fieldOf(run, 'tool'), 'driver'), 'rules'))];
}

function withCode(
  entries: readonly unknown[],
  key: string,
  codes: ReadonlyMap<string, string>,
): unknown[] {
  return entries.flatMap((entry) => {
    const code = codes.get(String(fieldOf(entry, key)));
    return code === undefined || !isPlainObject(entry) ? [] : [{ ...entry, [key]: code }];
  });
}

function codesByRuleId(rules: readonly PreviewRule[]): Map<string, string> {
  return new Map(
    rules.flatMap(({ code, name }): [string, string][] => [
      [code, code],
      [name, code],
    ]),
  );
}

function appendPreviewRun(
  main: Record<string, unknown>,
  {
    preview,
    codes,
  }: { readonly preview: Record<string, unknown>; readonly codes: ReadonlyMap<string, string> },
): void {
  const driver = fieldOf(fieldOf(main, 'tool'), 'driver');
  if (isPlainObject(driver)) {
    driver['rules'] = [...driverRules(main), ...withCode(driverRules(preview), 'id', codes)];
  }
  main['results'] = [
    ...listOf(main['results']),
    ...withCode(listOf(preview['results']), 'ruleId', codes),
  ];
}

export function mergePreviewReport(
  reportRoot: string,
  { mainReport, rules }: { readonly mainReport: string; readonly rules: readonly PreviewRule[] },
): void {
  const previewFile = path.join(reportRoot, PREVIEW_REPORT);
  const mainFile = resolveInside(reportRoot, mainReport);
  if (mainFile === undefined || !existsSync(previewFile)) {
    return;
  }
  const preview = firstRun(parseJson(readFileSync(previewFile, 'utf8')));
  const log = parseJson(readFileSync(mainFile, 'utf8'));
  const main = firstRun(log);
  rmSync(previewFile, { force: true });
  if (preview !== undefined && main !== undefined) {
    appendPreviewRun(main, { preview, codes: codesByRuleId(rules) });
    writeFileSync(mainFile, JSON.stringify(log));
  }
}

export function lintPreviewRules(
  context: ToolContext,
  { options, mainReport }: { readonly options: readonly string[]; readonly mainReport: string },
): void {
  const rules = ruffPreviewSelections(context);
  if (rules.length === 0) {
    return;
  }
  run(context, previewCheckArguments(options, { rules, reportRoot: context.reportRoot }), {
    accepted: [0, 1],
    rule: 'ruff-failed',
  });
  mergePreviewReport(context.reportRoot, { mainReport, rules });
}
