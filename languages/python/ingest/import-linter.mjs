import { createIdentityCounter } from '../../java/ingest/common.mjs';

const SUMMARY_LINE = /^Contracts: \d+ kept, \d+ broken\.$/m;
const BROKEN_SECTION = /^Broken contracts$/m;
const BROKEN_STATUS = /^(.+?) BROKEN(?: \[[\d.]+s\])?$/;
const DASHES = /^-{3,}$/;
const CHAIN_START = /^-\s+(.*)$/;
const CHAIN_CONTINUATION = /^\s+(\S.*)$/;
const HOP = /^(\S+) -> (\S+?)(?: \((?:l\.)?(\d+)(?:, (?:l\.)?\d+)*\))?$/;
const NO_VIOLATION = { modules: [], note: '' };

export function importLinterCompleted(text) {
  return SUMMARY_LINE.test(text);
}

function brokenContractNames(lines) {
  return lines.flatMap((line) => {
    const match = BROKEN_STATUS.exec(line);
    return match === null ? [] : [match[1]];
  });
}

function isTitle(lines, index) {
  const line = lines[index];
  return line !== '' && !line.startsWith('-') && DASHES.test(lines[index + 1] ?? '');
}

function contractBlocks(lines) {
  const blocks = [];
  for (const [index, line] of lines.entries()) {
    if (isTitle(lines, index)) {
      blocks.push({ name: line, body: [] });
      continue;
    }
    blocks.at(-1)?.body.push(line);
  }
  return blocks;
}

function addLine(violations, start, hop) {
  const last = violations.at(-1);
  if (hop !== null && start === null && last !== undefined && last.modules.length > 0) {
    last.modules.push(hop[2]);
    return;
  }
  if (hop !== null) {
    violations.push({
      modules: [hop[1], hop[2]],
      line: hop[3] === undefined ? undefined : +hop[3],
    });
    return;
  }
  if (start !== null) {
    violations.push({ modules: [], note: start[1].trim() });
  }
}

function violationsOf(body) {
  const violations = [];
  for (const line of body) {
    const start = CHAIN_START.exec(line);
    addLine(violations, start, HOP.exec((start ?? CHAIN_CONTINUATION.exec(line))?.[1] ?? ''));
  }
  return violations;
}

function describe(violation) {
  return violation.modules.length > 0 ? violation.modules.join(' -> ') : violation.note;
}

function brokenMessage(name, violation, file) {
  const detail = violation === NO_VIOLATION ? '' : `: ${describe(violation)}`;
  const route =
    file === undefined ? '' : ', or lift this file with exclude in nitpicker.config.json';
  return `Import contract "${name}" is broken${detail}. Remove the import${route}.`;
}

function contractFinding({ name, violation, files, identity }) {
  const subject = violation === NO_VIOLATION ? '' : `:${describe(violation)}`;
  const file = files.get(violation.modules[0]);
  return {
    tool: 'import-linter',
    rule: 'contract-broken',
    path: file ?? '.',
    identity: identity(`contract:${name}${subject}`),
    message: brokenMessage(name, violation, file),
    classification: 'enforceable',
    ...(violation.line === undefined ? {} : { location: { line: violation.line } }),
  };
}

export function ingestImportLinter(text, { files = new Map() } = {}) {
  const sectionStart = text.search(BROKEN_SECTION);
  const summary = text.slice(0, sectionStart < 0 ? undefined : sectionStart).split(/\r?\n/);
  const blocks = sectionStart < 0 ? [] : contractBlocks(text.slice(sectionStart).split(/\r?\n/));
  const identity = createIdentityCounter();
  const findings = brokenContractNames(summary).flatMap((name) => {
    const violations = violationsOf(blocks.find((block) => block.name === name)?.body ?? []);
    return (violations.length > 0 ? violations : [NO_VIOLATION]).map((violation) =>
      contractFinding({ name, violation, files, identity }),
    );
  });
  return { findings };
}
