import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { TOOL_SKIPPED_RULE } from '../../../../../shared/rules/finding-helpers.mjs';
import { JAVA_FORMATTER_TOOLS } from '../../style/java-style.mts';

type ToolSkipped = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly classification: string;
  readonly message: string;
};
type Ran = { readonly tool: string; readonly rule: string };

export const ERROR_PRONE_SKIPPED = 'errorprone-skipped.txt';
export const FORMAT_SKIPPED = 'format-skipped.txt';
export const CHECKSTYLE_SKIPPED = 'checkstyle-skipped.txt';
export const STRUCTURE_SKIPPED = 'structure-skipped.txt';
export const DETEKT_SKIPPED = 'detekt-skipped.txt';

function reasonIn(reportRoot: string, file: string): string | undefined {
  const full = path.resolve(reportRoot, file);
  if (!full.startsWith(path.resolve(reportRoot) + path.sep)) {
    return undefined;
  }
  return existsSync(full) ? readFileSync(full, 'utf8').trim() : undefined;
}

export function skippedFiles(reportRoot: string): Set<string> {
  return new Set(
    [ERROR_PRONE_SKIPPED, FORMAT_SKIPPED, CHECKSTYLE_SKIPPED, STRUCTURE_SKIPPED].filter(
      (file) => reasonIn(reportRoot, file) !== undefined,
    ),
  );
}

function toolSkipped(tool: string, message: string): ToolSkipped {
  return {
    tool,
    rule: TOOL_SKIPPED_RULE,
    path: '.',
    identity: TOOL_SKIPPED_RULE,
    classification: 'tool-error',
    message,
  };
}

export function skippedToolFindings({
  reportRoot,
  javaStyle,
  moduleDir = '',
}: {
  reportRoot: string;
  javaStyle: string;
  moduleDir?: string;
}): ToolSkipped[] {
  const where = moduleDir === '' || moduleDir === '.' ? 'the project' : `module ${moduleDir}`;
  const { tool, label } = JAVA_FORMATTER_TOOLS[javaStyle] ?? JAVA_FORMATTER_TOOLS.google;
  const reports: readonly (readonly [string, string, string])[] = [
    [ERROR_PRONE_SKIPPED, 'errorprone', 'Error Prone'],
    [FORMAT_SKIPPED, tool, label],
    [CHECKSTYLE_SKIPPED, 'checkstyle', 'Checkstyle'],
    [STRUCTURE_SKIPPED, 'structure', 'The structure metrics'],
    [STRUCTURE_SKIPPED, 'crap', 'CRAP'],
    [DETEKT_SKIPPED, 'detekt', 'detekt'],
  ];
  return reports.flatMap(([file, name, title]) => {
    const reason = reasonIn(reportRoot, file);
    return reason === undefined
      ? []
      : [toolSkipped(name, `${title} did not run in ${where}: ${reason}.`)];
  });
}

type Snapshots<Finding extends Ran> = {
  readonly baseFindings: readonly Finding[];
  readonly headFindings: readonly Finding[];
  readonly [field: string]: unknown;
};

export function withoutSkippedTools<Finding extends Ran>({
  baseFindings,
  headFindings,
  ...rest
}: Snapshots<Finding>): Snapshots<Finding> {
  const skipped = new Set(
    [...baseFindings, ...headFindings]
      .filter(({ rule }) => rule === TOOL_SKIPPED_RULE)
      .map(({ tool }) => tool),
  );
  function ran({ tool }: Ran): boolean {
    return !skipped.has(tool);
  }
  return {
    ...rest,
    baseFindings: baseFindings.filter(ran),
    headFindings: headFindings.filter(ran),
  };
}
