import path from 'node:path';
import { hash } from '../../../../shared/rules/finding-helpers.mjs';

const RACE_TOOL = 'race';
const RACE_RULE = 'data-race';
const SEPARATOR = /^\s*={18}\s*$/u;
export const WARNING = 'WARNING: DATA RACE';
const ACCESS_KIND = String.raw`(?<kind>(?:Previous )?(?:atomic )?(?:read|write))(?: of size \d+)?`;
const ACCESS = new RegExp(
  String.raw`^${ACCESS_KIND} at 0x[\da-f]+ by (?:main goroutine|goroutine \d+):$`,
  'iu',
);
const FRAME_FILE = /^(?<file>.+\.go):(?<line>\d+)(?: \+0x[\da-f]+)?$/u;
const RACE_FAILURE = /race detected (?:during execution of test|outside of test)/u;
const LITERAL_NUMBER = /\.(?<kind>func|gowrap)\d+/gu;
const UNKNOWN = { function: 'a function the report does not name', full: '?' };
const FIX =
  'Guard the shared value with a sync.Mutex, make it a sync/atomic value, or hand it over through a channel.';

function blocksOf(text) {
  const blocks = [];
  let current;
  for (const line of text.split(/\r?\n/u).map((raw) => raw.trim())) {
    if (current !== undefined && SEPARATOR.test(line)) {
      blocks.push(current);
      current = undefined;
    } else if (current !== undefined) {
      current.push(line);
    } else if (line === WARNING) {
      current = [];
    }
  }
  return blocks;
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
  const full = name.replace(/\(\)$/u, '');
  const file =
    position === undefined ? undefined : relativeFile(module.root, module.path, position.file);
  return {
    function: full.slice(packageEnd(full)),
    full,
    ...(file === undefined ? {} : { file, line: Number(position.line) }),
  };
}

function accessFrame(lines, start, module) {
  const end = lines.indexOf('', start);
  const stack = lines.slice(start + 1, end === -1 ? lines.length : end);
  const frames = stack.flatMap((name, index) => {
    const position = FRAME_FILE.exec(stack[index + 1] ?? '')?.groups;
    return position === undefined ? [] : [frameOf(name, position, module)];
  });
  return frames.find(({ file }) => file !== undefined) ?? frames[0] ?? UNKNOWN;
}

function accessesOf(lines, module) {
  return lines.flatMap((line, index) => {
    const kind = ACCESS.exec(line)?.groups?.kind;
    return kind === undefined
      ? []
      : [
          {
            kind: kind.replace(/^Previous /u, '').toLowerCase(),
            ...accessFrame(lines, index, module),
          },
        ];
  });
}

function sortKey({ file = '', full }) {
  return `${file === '' ? '1' : '0'}${file}\0${full}`;
}

export function parseRaces(text, module) {
  return blocksOf(text).flatMap((lines) => {
    const accesses = accessesOf(lines, module).slice(0, 2);
    return accesses.length === 0
      ? []
      : [accesses.toSorted((left, right) => sortKey(left).localeCompare(sortKey(right)))];
  });
}

export function withoutRaceReports(output) {
  const kept = [];
  let inside = false;
  let opened = false;
  for (const line of output.split(/(?<=\n)/u)) {
    const text = line.trim();
    const keep = !(inside || (opened && text === WARNING) || RACE_FAILURE.test(text));
    if (inside) {
      inside = !SEPARATOR.test(text);
    } else if (opened && text === WARNING) {
      kept.pop();
      inside = true;
    }
    kept.push(...(keep ? [line] : []));
    opened = keep && SEPARATOR.test(text);
  }
  return kept.join('');
}

function describe({ kind, function: name, file, line }) {
  return file === undefined ? `${kind} in ${name}` : `${kind} in ${name} (${file}:${String(line)})`;
}

function identityName({ full }) {
  return full.replaceAll(LITERAL_NUMBER, '.$<kind>');
}

function raceFinding(accesses, test) {
  const [first] = accesses;
  const names = accesses.map(identityName).toSorted((left, right) => left.localeCompare(right));
  const found = test === '' ? '' : `, found by ${test}`;
  const pair =
    accesses.length === 2 ? `${describe(first)} and ${describe(accesses[1])}` : describe(first);
  return {
    tool: RACE_TOOL,
    rule: RACE_RULE,
    path: first.file ?? '.',
    identity: `race:${hash(names.join('\0'))}`,
    message: `Data race: ${pair} touch the same memory from two goroutines without synchronization${found}. ${FIX}`,
    allowedForm: FIX,
    classification: 'enforceable',
    ...(first.file === undefined ? {} : { location: { line: first.line } }),
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

const ENABLE_RACE =
  'Enable cgo (CGO_ENABLED=1 with a C compiler such as gcc on the PATH) on a platform the race detector supports to run the tests with -race.';

export function raceNotCheckedFinding(reason) {
  return {
    tool: RACE_TOOL,
    rule: 'race-not-checked',
    path: '.',
    identity: 'race-not-checked',
    message: `Data races were not checked: ${reason} ${ENABLE_RACE}`,
    classification: 'descriptive',
  };
}

export function raceOnlyFailureFinding(packageName, tests) {
  return {
    tool: RACE_TOOL,
    rule: 'race-not-checked',
    path: '.',
    identity: `race-not-checked:${packageName}`,
    message: `Data races were not fully checked in ${packageName}: ${tests.join(', ')} failed under -race without a race report and passed without it, so they count as passing. The race detector slows tests down 2 to 20 times; a timeout or a goroutine limit under -race is the usual cause. Run go test -race on the package to see the failure.`,
    classification: 'descriptive',
  };
}
