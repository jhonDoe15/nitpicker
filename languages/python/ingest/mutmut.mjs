import { addMetric } from '../../../shared/rules/finding-helpers.mjs';
import { mutantFindings } from '../../../shared/rules/mutation.mjs';

export const SUPPORTED_MUTMUT = 'mutmut 3.x';

const STATUS_BY_EXIT_CODE = new Map([
  [0, 'Survived'],
  [1, 'Killed'],
  [3, 'Killed'],
  [5, 'NoCoverage'],
  [33, 'NoCoverage'],
  [2, 'Ignored'],
  [34, 'Ignored'],
  [37, 'CompileError'],
  [24, 'Timeout'],
  [-24, 'Timeout'],
  [36, 'Timeout'],
  [152, 'Timeout'],
  [255, 'Timeout'],
]);
const CLASS_SEPARATOR = 'ǁ';
const KEY = /^(x.+)__mutmut_(\d+)$/u;
const DEFINITION = /^(\s*)(?:async\s+)?def\s+([^\s(]+)/u;
const CLOSING_BRACKET = /^\s*[)\]}]/u;
const TOKEN =
  /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\w+|\*\*=|\/\/=|>>=|<<=|\*\*|\/\/|==|!=|<=|>=|->|:=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<|>>|\s+|[\s\S]/gu;
const NUMBER = /^\d[\w.]*$/u;
const STRING = /^[a-z]{0,2}["']/iu;
const OPERATOR = /^[^\w\s"']+$/u;

export function ingestMutmut(data, options = {}) {
  if (!Array.isArray(data?.files)) {
    throw new TypeError('mutmut run data must contain a files array');
  }
  const tool = options.tool ?? 'mutmut';
  const parsed = data.files.map((file) => ({ file, mutants: parsedMutants(file) }));
  rejectUnreadableKeys(parsed);
  const mutants = parsed.flatMap(({ file, mutants: fileResults }) =>
    describedMutants(file, fileResults),
  );
  const findings = mutantFindings(withIdentities(mutants), { tool });
  addStatusSummaries(findings, parsed, tool);
  return { findings };
}

function rejectUnreadableKeys(parsed) {
  const keys = parsed.flatMap(({ file }) => Object.keys(file.exitCodes));
  if (keys.length > 0 && parsed.every(({ mutants }) => mutants.length === 0)) {
    throw new TypeError(
      `mutmut wrote ${String(keys.length)} results whose names are not in the form nitpicker reads (for example ${keys[0]}): this mutmut version is not supported (nitpicker reads the run data of ${SUPPORTED_MUTMUT})`,
    );
  }
}

function addStatusSummaries(findings, parsed, tool) {
  const counts = new Map();
  for (const { mutants } of parsed) {
    for (const { status } of mutants) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  }
  for (const [status, value] of counts) {
    addMetric(findings, {
      analyzerName: tool,
      rule: 'mutation-summary',
      path: '.',
      identity: `status:${status}`,
      message: `${status} mutants`,
      metricName: status,
      value,
    });
  }
}

export function statusOfExitCode(exitCode) {
  if (exitCode === null) {
    return 'Ignored';
  }
  return STATUS_BY_EXIT_CODE.get(exitCode) ?? 'RuntimeError';
}

function parsedMutants(file) {
  return Object.entries(file.exitCodes)
    .map(([key, exitCode]) => ({ ...parseKey(key), status: statusOfExitCode(exitCode) }))
    .filter((mutant) => mutant.mangled !== undefined);
}

function describedMutants(file, mutants) {
  const blocks = functionBlocks(file.mutated);
  const originalLines = file.original?.split(/\r?\n/u);
  return mutants
    .filter((mutant) => mutant.status !== 'Killed')
    .sort((a, b) => a.number - b.number)
    .map((mutant) => ({
      path: file.path,
      symbol: mutant.symbol,
      status: mutant.status,
      ...describeChange({ mutant, blocks, originalLines }),
    }));
}

function parseKey(key) {
  const match = KEY.exec(key.slice(key.lastIndexOf('.') + 1));
  if (match === null) {
    return {};
  }
  const symbol = symbolOf(match[1]);
  return {
    mangled: match[1],
    number: Number(match[2]),
    symbol,
    name: symbol.slice(symbol.lastIndexOf('.') + 1),
  };
}

function symbolOf(mangled) {
  if (mangled.startsWith(`x${CLASS_SEPARATOR}`)) {
    return mangled.slice(1).split(CLASS_SEPARATOR).filter(Boolean).join('.');
  }
  return mangled.slice(2);
}

export function functionBlocks(source) {
  const lines = source.split(/\r?\n/u);
  const blocks = new Map();
  for (const [start, line] of lines.entries()) {
    const definition = DEFINITION.exec(line);
    if (definition !== null) {
      blocks.set(definition[2], blockLines(lines, start, definition[1].length));
    }
  }
  return blocks;
}

function blockLines(lines, start, indent) {
  const stop = lines.findIndex((line, index) => index > start && !continuesBlock(line, indent));
  const block = lines.slice(start, stop === -1 ? lines.length : stop);
  return block.slice(0, block.findLastIndex((line) => line.trim() !== '') + 1);
}

function continuesBlock(line, indent) {
  return (
    line.trim() === '' ||
    CLOSING_BRACKET.test(line) ||
    line.length - line.trimStart().length > indent
  );
}

function variantLines({ blocks, mutant }, variant) {
  const blockName = `${mutant.mangled}__mutmut_${variant}`;
  return blocks.get(blockName)?.map((line) => line.replaceAll(blockName, mutant.name));
}

function describeChange({ mutant, blocks, originalLines }) {
  const original = variantLines({ blocks, mutant }, 'orig');
  const mutated = variantLines({ blocks, mutant }, String(mutant.number));
  const change =
    original === undefined || mutated === undefined
      ? undefined
      : changedRegion(original.join('\n'), mutated.join('\n'));
  if (change === undefined) {
    return { label: 'mutation' };
  }
  const start = locate(originalLines, original);
  return {
    original: change.original,
    replacement: change.replacement,
    label: labelOf(change),
    ...(start === undefined ? {} : { line: start + 1 + change.lineOffset }),
  };
}

function changedRegion(original, mutated) {
  const before = original.match(TOKEN);
  const after = mutated.match(TOKEN);
  const head = commonLength(before, after);
  const tail = commonLength(before.slice(head).reverse(), after.slice(head).reverse());
  const removed = before
    .slice(head, before.length - tail)
    .join('')
    .trim();
  const added = after
    .slice(head, after.length - tail)
    .join('')
    .trim();
  if (removed === '' && added === '') {
    return undefined;
  }
  return {
    original: removed,
    replacement: added,
    lineOffset: before.slice(0, head).join('').split('\n').length - 1,
  };
}

function commonLength(left, right) {
  const differing = left.findIndex((token, index) => token !== right[index]);
  return differing === -1 ? left.length : differing;
}

function labelOf({ original, replacement }) {
  if (NUMBER.test(original) && NUMBER.test(replacement)) {
    return 'number';
  }
  if (STRING.test(original) || STRING.test(replacement)) {
    return 'string';
  }
  return OPERATOR.test(original) && OPERATOR.test(replacement) ? 'operator' : 'expression';
}

function locate(sourceLines, wantedLines) {
  if (sourceLines === undefined) {
    return undefined;
  }
  const found = sourceLines.findIndex((_, index) =>
    wantedLines.every((line, offset) => sourceLines[index + offset]?.trimEnd() === line.trimEnd()),
  );
  return found === -1 ? undefined : found;
}

function withIdentities(mutants) {
  const counts = new Map();
  return mutants.map((mutant) => {
    const base = `${mutant.symbol}|${mutant.original ?? '?'}→${mutant.replacement ?? '?'}`;
    const group = `${mutant.status}\0${base}`;
    const occurrence = (counts.get(group) ?? 0) + 1;
    counts.set(group, occurrence);
    return { ...mutant, identity: `${base}#${String(occurrence)}` };
  });
}
