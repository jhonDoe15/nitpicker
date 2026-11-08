import path from 'node:path';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';

const RACE_TOOL = 'race';
const RACE_RULE = 'data-race';
const SEPARATOR = /^\s*={18}\s*$/mu;
export const WARNING = 'WARNING: DATA RACE';
const ACCESS_KIND = String.raw`(?<kind>(?:Previous )?(?:atomic )?(?:read|write))(?: of size \d+)?`;
const ACCESS = new RegExp(
  String.raw`^${ACCESS_KIND} at 0x[\da-f]+ by (?:main goroutine|goroutine \d+):$`,
  'iu',
);
const FRAME_FILE = /^(?<file>\S+\.go):(?<line>\d+)(?: \+0x[\da-f]+)?$/u;
const RACE_FAILURE = /race detected (?:during execution of test|outside of test)/u;
const FIX =
  'Guard the shared value with a sync.Mutex, make it a sync/atomic value, or hand it over through a channel.';

function blocksOf(text) {
  return text
    .split(SEPARATOR)
    .map((block) =>
      block
        .trim()
        .split(/\r?\n/u)
        .map((line) => line.trim()),
    )
    .filter((lines) => lines[0] === WARNING);
}

function relativeFile(projectRoot, modulePath, file) {
  if (!path.isAbsolute(file)) {
    return modulePath !== undefined && file.startsWith(`${modulePath}/`)
      ? file.slice(modulePath.length + 1)
      : undefined;
  }
  const relative = path.relative(projectRoot, file);
  return relative.startsWith('..') || path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep).join('/');
}

function packageEnd(name) {
  const brackets = [name.indexOf('['), name.indexOf('(')].filter((index) => index !== -1);
  const end = brackets.length === 0 ? name.length : Math.min(...brackets);
  return name.lastIndexOf('/', end) + 1;
}

function frameOf(name, position, module) {
  const file =
    position === undefined ? undefined : relativeFile(module.root, module.path, position.file);
  if (file === undefined) {
    return undefined;
  }
  const full = name.replace(/\(\)$/u, '');
  return { function: full.slice(packageEnd(full)), full, file, line: Number(position.line) };
}

function accessFrame(lines, start, module) {
  const end = lines.indexOf('', start);
  const stack = lines.slice(start + 1, end === -1 ? lines.length : end);
  const names = stack.filter((_, index) => index % 2 === 0);
  return names
    .map((name, index) =>
      frameOf(name, FRAME_FILE.exec(stack[index * 2 + 1] ?? '')?.groups, module),
    )
    .find((frame) => frame !== undefined);
}

function accessesOf(lines, module) {
  return lines.flatMap((line, index) => {
    const kind = ACCESS.exec(line)?.groups?.kind;
    const frame = kind === undefined ? undefined : accessFrame(lines, index, module);
    return frame === undefined
      ? []
      : [{ kind: kind.replace(/^Previous /u, '').toLowerCase(), ...frame }];
  });
}

function sortKey({ file, full }) {
  return `${file}\0${full}`;
}

export function parseRaces(text, module) {
  return blocksOf(text).flatMap((lines) => {
    const accesses = accessesOf(lines, module).slice(0, 2);
    return accesses.length === 2
      ? [accesses.sort((left, right) => sortKey(left).localeCompare(sortKey(right)))]
      : [];
  });
}

export function withoutRaceReports(output) {
  const lines = output.split(/(?<=\n)/u);
  const kept = [];
  let inside = false;
  for (const line of lines) {
    if (SEPARATOR.test(line)) {
      inside = !inside;
    } else if (!inside && !RACE_FAILURE.test(line.trim())) {
      kept.push(line);
    }
  }
  return kept.join('');
}

function describe({ kind, function: name, file, line }) {
  return `${kind} in ${name} (${file}:${String(line)})`;
}

function raceFinding([first, second], test) {
  const functions = [first.full, second.full].toSorted((left, right) => left.localeCompare(right));
  const identity = `race:${hash(functions.join('\0'))}`;
  const found = test === '' ? '' : `, found by ${test}`;
  return {
    tool: RACE_TOOL,
    rule: RACE_RULE,
    path: first.file,
    identity,
    message: `Data race: ${describe(first)} and ${describe(second)} touch the same memory from two goroutines without synchronization${found}. ${FIX}`,
    allowedForm: FIX,
    classification: 'enforceable',
    location: { line: first.line },
  };
}

export function raceFindings(reports) {
  const findings = new Map();
  for (const { accesses, test } of reports) {
    const finding = raceFinding(accesses, test);
    if (!findings.has(finding.identity)) {
      findings.set(finding.identity, finding);
    }
  }
  return [...findings.values()];
}

export function raceNotCheckedFinding(reason) {
  return {
    tool: RACE_TOOL,
    rule: 'race-not-checked',
    path: '.',
    identity: 'race-not-checked',
    message: `Data races were not checked: ${reason} Enable cgo (CGO_ENABLED=1 with a C compiler such as gcc on the PATH) on a platform the race detector supports to run the tests with -race.`,
    classification: 'descriptive',
  };
}
