import { mutantFindings } from '../../../shared/rules/mutation.mjs';
import { decodeEntities } from './common.mjs';

const PIT_WAY_OUT =
  'If no input can tell the two apart (a compareTo boundary, a discarded lambda return), simplify the code so this mutant disappears.';

const STATUS_NAMES = {
  KILLED: 'Killed',
  SURVIVED: 'Survived',
  NO_COVERAGE: 'NoCoverage',
  TIMED_OUT: 'Timeout',
  MEMORY_ERROR: 'RuntimeError',
  RUN_ERROR: 'RuntimeError',
  NON_VIABLE: 'CompileError',
  STARTED: 'Ignored',
};

export function ingestPit(xml, options = {}) {
  if (!/<mutations[\s>]|<mutations\/>/.test(xml)) {
    throw new TypeError('PIT report root element must be <mutations>');
  }
  const tool = options.tool ?? 'pit';
  const resolvePath = options.resolvePath ?? ((className, sourceFile) => sourceFile);
  const mutants = [...xml.matchAll(/<mutation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mutation>)/g)]
    .map(([, attributes, body = '']) => parseMutant(attributes, body))
    .filter((mutant) => mutant !== undefined);

  const { groups, statusCounts } = groupMutants(mutants, resolvePath);
  const findings = mutantFindings(neutralMutants(groups), { tool, wayOut: PIT_WAY_OUT });
  findings.push(...statusSummaries(statusCounts, tool));
  return { findings };
}

function groupMutants(mutants, resolvePath) {
  const statusCounts = new Map();
  const groups = new Map();
  for (const mutant of mutants) {
    const status = STATUS_NAMES[mutant.status] ?? 'Unknown';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    const filePath =
      status === 'Killed' ? undefined : resolvePath(mutant.className, mutant.sourceFile);
    if (filePath === undefined) {
      continue;
    }
    const key = [
      mutant.className,
      `${mutant.method}${mutant.methodDescription}`,
      mutator(mutant.mutator),
      mutant.description,
    ].join('|');
    const group = groups.get(`${status}\0${key}`) ?? [];
    group.push({ mutant, status, key, filePath });
    groups.set(`${status}\0${key}`, group);
  }
  return { groups, statusCounts };
}

function neutralMutants(groups) {
  const neutral = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.mutant.line - b.mutant.line || a.mutant.block - b.mutant.block);
    for (const [index, { mutant, status, key, filePath }] of group.entries()) {
      neutral.push({
        path: filePath,
        identity: `${key}#${String(index + 1)}`,
        status,
        label: `${mutator(mutant.mutator)}: ${mutant.description}`,
        symbol: `${mutant.className}#${mutant.method}${mutant.methodDescription}`,
        line: mutant.line,
      });
    }
  }
  return neutral;
}

function statusSummaries(statusCounts, tool) {
  return [...statusCounts].map(([status, value]) => ({
    tool,
    rule: 'mutation-summary',
    path: '.',
    identity: `status:${status}`,
    message: `${status} mutants`,
    classification: 'descriptive',
    metric: { name: status, value },
  }));
}

function mutator(qualifiedName) {
  return qualifiedName.slice(qualifiedName.lastIndexOf('.') + 1);
}

function parseMutant(attributes, body) {
  const status = /\bstatus\s*=\s*['"]([^'"]*)['"]/.exec(attributes)?.[1];
  function field(name) {
    const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(body);
    return match === null ? undefined : decodeEntities(match[1]);
  }
  const className = field('mutatedClass');
  const sourceFile = field('sourceFile');
  if (status === undefined || className === undefined || sourceFile === undefined) {
    return undefined;
  }
  return {
    status,
    className,
    sourceFile,
    method: field('mutatedMethod') ?? '',
    methodDescription: field('methodDescription') ?? '',
    mutator: field('mutator') ?? 'unknown',
    description: field('description') ?? '',
    line: Number.parseInt(field('lineNumber') ?? '', 10) || 0,
    block: Number.parseInt((field('blocks') ?? '').match(/\d+/)?.[0] ?? '', 10) || 0,
  };
}
