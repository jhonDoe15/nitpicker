import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_RULE_IDS } from '../../../../shared/project-rules/hygiene-rules.mjs';
import { ANY_STATUS, failure, run } from '../execution/go-process.mts';
import { GO_MOD, moduleFileText } from '../execution/go-module.mts';
import type { FindingRow, GoContext } from '../go-types.mts';

type Requirement = { module: string; version: string; indirect: boolean };
type DependencyFinding = {
  rule: string;
  module: string;
  message: string;
  line?: number | undefined;
};

const TIDY_REPORT = 'tidy.diff';
const DEPENDENCIES_TOOL = 'dependencies';
const GO_MOD_DIFF = /^diff \S+\/go\.mod \S+\/go\.mod$/u;
const DIFF_START = /^diff /u;
const REQUIREMENT = /^(?:require\s+)?(\S+)\s+(v\S+)$/u;
const COMMENT = '//';
const INDIRECT = /^\s*indirect\b/u;
const BLOCK_START = /^(\w+)\s*\($/u;
const SINGLE_REQUIRE = /^require\s+[^(\s]/u;
const KEYWORDS = new Set(['go', 'toolchain', 'module', 'retract', 'exclude', 'tool', 'godebug']);
const TIDY_FIX = 'Run `go mod tidy`.';

export function tidy(context: GoContext): void {
  const command = ['go', 'mod', 'tidy', '-diff'];
  const result = run(context, command, { rule: 'go-mod-tidy-failed', accepted: ANY_STATUS });
  const text = result.stdout ?? '';
  if (result.status !== 0 && !DIFF_START.test(text)) {
    throw failure({ command, result, rule: 'go-mod-tidy-failed' });
  }
  writeFileSync(path.join(context.reportRoot, TIDY_REPORT), text);
}

function goModDiffLines(text: string) {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => GO_MOD_DIFF.test(line));
  if (start === -1) {
    return [];
  }
  const end = lines.findIndex((line, index) => index > start && DIFF_START.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

function requirement(line: string): Requirement | undefined {
  const start = line.indexOf(COMMENT);
  const comment = start === -1 ? '' : line.slice(start + COMMENT.length);
  const match = REQUIREMENT.exec((start === -1 ? line : line.slice(0, start)).trim());
  const [, module = '', version = ''] = match ?? [];
  return match === null || KEYWORDS.has(module)
    ? undefined
    : { module, version, indirect: INDIRECT.test(comment) };
}

function requirementsOf(lines: readonly string[], sign: string) {
  return new Map<string, Omit<Requirement, 'module'>>(
    lines
      .filter((line) => line.startsWith(sign) && !line.startsWith(`${sign}${sign}${sign}`))
      .map((line) => requirement(line.slice(1)))
      .filter((parsed) => parsed !== undefined)
      .map(({ module, version, indirect }) => [module, { version, indirect }]),
  );
}

function requireLines(projectRoot: string) {
  const lines = new Map<string, number>();
  let block: string | undefined;
  const texts = (moduleFileText(projectRoot, GO_MOD) ?? '').split(/\r?\n/u);
  for (const [index, text] of texts.entries()) {
    const line = text.trim();
    block = line === ')' ? undefined : (BLOCK_START.exec(line)?.[1] ?? block);
    const parsed = requirement(line);
    if (parsed !== undefined && (block === 'require' || SINGLE_REQUIRE.test(line))) {
      lines.set(parsed.module, index + 1);
    }
  }
  return lines;
}

function dependencyFinding({ rule, module, message, line }: DependencyFinding): FindingRow {
  return {
    tool: DEPENDENCIES_TOOL,
    rule,
    path: GO_MOD,
    identity: `${rule}:${module}`,
    message,
    classification: 'enforceable',
    ...(line === undefined ? {} : { location: { line } }),
  };
}

export function tidyFindings(projectRoot: string, text: string): FindingRow[] {
  const lines = goModDiffLines(text);
  const removed = requirementsOf(lines, '-');
  const added = requirementsOf(lines, '+');
  const required = requireLines(projectRoot);
  const unused = [...removed.keys()]
    .filter((module) => !added.has(module) && required.has(module))
    .map((module) =>
      dependencyFinding({
        rule: PACKAGE_RULE_IDS.unusedDependency,
        module,
        message: `go.mod requires ${module}, but no package of the module needs it. ${TIDY_FIX}`,
        line: required.get(module),
      }),
    );
  const unlisted = [...added]
    .filter(([module, { indirect }]) => !(removed.has(module) || indirect))
    .map(([module]) =>
      dependencyFinding({
        rule: PACKAGE_RULE_IDS.unlistedDependency,
        module,
        message: `The code imports a package of ${module}, which go.mod does not require. ${TIDY_FIX}`,
      }),
    );
  return [...unused, ...unlisted];
}

export function readTidyFindings(context: GoContext): FindingRow[] {
  return tidyFindings(
    context.projectRoot,
    readFileSync(path.join(context.reportRoot, TIDY_REPORT), 'utf8'),
  );
}
