import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PACKAGE_RULE_IDS } from '../../../../shared/project-rules/hygiene-rules.mjs';
import { ANY_STATUS, failure, run } from '../execution/go-process.mjs';
import { GO_MOD, moduleFileText } from '../execution/go-module.mjs';

const TIDY_REPORT = 'tidy.diff';
const DEPENDENCIES_TOOL = 'dependencies';
const GO_MOD_DIFF = /^diff \S+\/go\.mod \S+\/go\.mod$/u;
const DIFF_START = /^diff /u;
const REQUIREMENT = /^(?:require\s+)?(\S+)\s+(v\S+)(\s*\/\/\s*indirect)?$/u;
const KEYWORDS = new Set(['go', 'toolchain', 'module', 'retract', 'exclude', 'tool', 'godebug']);
const TIDY_FIX = 'Run `go mod tidy`.';

export function tidy(context) {
  const command = ['go', 'mod', 'tidy', '-diff'];
  const result = run(context, command, { rule: 'go-mod-tidy-failed', accepted: ANY_STATUS });
  const text = result.stdout ?? '';
  if (result.status !== 0 && !DIFF_START.test(text)) {
    throw failure({ command, result, rule: 'go-mod-tidy-failed' });
  }
  writeFileSync(path.join(context.reportRoot, TIDY_REPORT), text);
}

function goModDiffLines(text) {
  const lines = text.split(/\r?\n/u);
  const start = lines.findIndex((line) => GO_MOD_DIFF.test(line));
  if (start === -1) {
    return [];
  }
  const end = lines.findIndex((line, index) => index > start && DIFF_START.test(line));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

function requirementsOf(lines, sign) {
  return new Map(
    lines
      .filter((line) => line.startsWith(sign) && !line.startsWith(`${sign}${sign}${sign}`))
      .map((line) => REQUIREMENT.exec(line.slice(1).replace(/\s+$/u, '').trim()))
      .filter((match) => match !== null && !KEYWORDS.has(match[1]) && !match[0].includes('=>'))
      .map(([, module, version, indirect]) => [
        module,
        { version, indirect: indirect !== undefined },
      ]),
  );
}

function lineOf(projectRoot, module) {
  const lines = (moduleFileText(projectRoot, GO_MOD) ?? '').split(/\r?\n/u);
  const index = lines.findIndex((line) => line.split(/\s+/u).includes(module));
  return index === -1 ? undefined : index + 1;
}

function dependencyFinding({ rule, module, message, line }) {
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

export function tidyFindings(projectRoot, text) {
  const lines = goModDiffLines(text);
  const removed = requirementsOf(lines, '-');
  const added = requirementsOf(lines, '+');
  const unused = [...removed.keys()]
    .filter((module) => !added.has(module))
    .map((module) =>
      dependencyFinding({
        rule: PACKAGE_RULE_IDS.unusedDependency,
        module,
        message: `go.mod requires ${module}, but no package of the module needs it. ${TIDY_FIX}`,
        line: lineOf(projectRoot, module),
      }),
    );
  const unlisted = [...added]
    .filter(([module, { indirect }]) => !removed.has(module) && !indirect)
    .map(([module]) =>
      dependencyFinding({
        rule: PACKAGE_RULE_IDS.unlistedDependency,
        module,
        message: `The code imports a package of ${module}, which go.mod does not require. ${TIDY_FIX}`,
      }),
    );
  return [...unused, ...unlisted];
}

export function readTidyFindings(context) {
  return tidyFindings(
    context.projectRoot,
    readFileSync(path.join(context.reportRoot, TIDY_REPORT), 'utf8'),
  );
}
