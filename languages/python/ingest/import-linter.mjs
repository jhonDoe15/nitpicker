import { createIdentityCounter } from '../../java/ingest/common.mjs';

export const IMPORT_LINTER_TOOL = 'import-linter';
export const CONTRACT_BROKEN_RULE = 'contract-broken';
const SUMMARY_LINE = /^Contracts: \d+ kept, \d+ broken\.$/m;
const BROKEN_SECTION = /^Broken contracts$/m;
const BROKEN_STATUS = /^(.+?) BROKEN(?: \[[\d.]+s\])?$/;
const DASHES = /^-{3,}$/;
const CHAIN_START = /^-\s+(.*)$/;
const CHAIN_CONTINUATION = /^\s+(\S.*)$/;
const HOP = /^(\S+) -> (\S+?)(?: \(l\.(\d+)(?:, \d+)*\))?$/;

export function importLinterCompleted(text) {
  return SUMMARY_LINE.test(text);
}

function brokenContractNames(lines) {
  return lines.flatMap((line) => {
    const match = BROKEN_STATUS.exec(line);
    return match === null ? [] : [match[1]];
  });
}

function contractBlocks(lines) {
  const blocks = [];
  for (const [index, line] of lines.entries()) {
    if (line !== '' && !line.startsWith('-') && DASHES.test(lines[index + 1] ?? '')) {
      blocks.push({ name: line, body: [] });
    } else if (blocks.length > 0) {
      blocks.at(-1).body.push(line);
    }
  }
  return blocks;
}

function violationsOf(body) {
  const violations = [];
  for (const line of body) {
    const start = CHAIN_START.exec(line);
    const hop = HOP.exec((start ?? CHAIN_CONTINUATION.exec(line))?.[1] ?? '');
    const last = violations.at(-1);
    if (hop !== null && start === null && last?.modules.length > 0) {
      last.modules.push(hop[2]);
    } else if (hop !== null) {
      const hopLine = hop[3] === undefined ? undefined : Number(hop[3]);
      violations.push({ modules: [hop[1], hop[2]], line: hopLine });
    } else if (start !== null) {
      violations.push({ modules: [], note: start[1].trim() });
    }
  }
  return violations;
}

function describe(violation) {
  return violation.modules.length > 0 ? violation.modules.join(' -> ') : violation.note;
}

function brokenMessage(name, violation) {
  const detail = violation === undefined ? '' : `: ${describe(violation)}`;
  return `Import contract "${name}" is broken${detail}. Remove the import, or lift this file with exclude in nitpicker.config.json.`;
}

export function ingestImportLinter(text, { fileOf = () => undefined } = {}) {
  const sectionStart = text.search(BROKEN_SECTION);
  const summary = text.slice(0, sectionStart < 0 ? undefined : sectionStart).split(/\r?\n/);
  const blocks = sectionStart < 0 ? [] : contractBlocks(text.slice(sectionStart).split(/\r?\n/));
  const unique = createIdentityCounter();
  const findings = [];
  for (const name of brokenContractNames(summary)) {
    const violations = violationsOf(blocks.find((block) => block.name === name)?.body ?? []);
    for (const violation of violations.length > 0 ? violations : [undefined]) {
      const subject = violation === undefined ? '' : `:${describe(violation)}`;
      findings.push({
        tool: IMPORT_LINTER_TOOL,
        rule: CONTRACT_BROKEN_RULE,
        path: fileOf(violation?.modules[0]) ?? '.',
        identity: unique(`contract:${name}${subject}`),
        message: brokenMessage(name, violation),
        classification: 'enforceable',
        ...(violation?.line === undefined ? {} : { location: { line: violation.line } }),
      });
    }
  }
  return { findings };
}
