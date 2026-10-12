import { mutantFindings } from '../../../shared/rules/mutation.mjs';

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
  const mutants = data.files.flatMap(fileMutants);
  return { findings: mutantFindings(withIdentities(mutants), { tool: options.tool ?? 'mutmut' }) };
}

export function statusOfExitCode(exitCode) {
  if (exitCode === null) {
    return 'Ignored';
  }
  return STATUS_BY_EXIT_CODE.get(exitCode) ?? 'RuntimeError';
}

function fileMutants(file) {
  const blocks = functionBlocks(file.mutated);
  const originalLines = file.original?.split(/\r?\n/u);
  return Object.entries(file.exitCodes)
    .map(([key, exitCode]) => ({ ...parseKey(key), status: statusOfExitCode(exitCode) }))
    .filter((mutant) => mutant.mangled !== undefined && mutant.status !== 'Killed')
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
  let end = start + 1;
  while (end < lines.length && continuesBlock(lines[end], indent)) {
    end += 1;
  }
  while (lines[end - 1].trim() === '') {
    end -= 1;
  }
  return lines.slice(start, end);
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
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
  }
  return length;
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
