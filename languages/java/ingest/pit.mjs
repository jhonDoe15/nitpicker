import { mutantFindings } from '../../../shared/rules/mutation.mjs';
import { decodeEntities } from '../../../shared/ingest/common.mjs';

const PIT_WAY_OUT =
  'If no input can tell the two apart (a compareTo boundary, a discarded lambda return, a field set to the value it already has, a redundant trim() or sorted()), simplify the code so this mutant disappears.';

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
  const generated = options.generated;
  const mutants = [...xml.matchAll(/<mutation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mutation>)/g)]
    .map(([, attributes, body = '']) => parseMutant(attributes, body))
    .filter((mutant) => mutant !== undefined);

  const { groups, statusCounts, leftOut } = groupMutants(mutants, { resolvePath, generated });
  const findings = mutantFindings(neutralMutants(groups, options.functionAt), {
    tool,
    wayOut: PIT_WAY_OUT,
  });
  findings.push(...statusSummaries(statusCounts, tool), ...leftOutSummary(leftOut, tool));
  return { findings };
}

function groupMutants(mutants, { resolvePath, generated }) {
  const statusCounts = new Map();
  const groups = new Map();
  let leftOut = 0;
  const judge = generated?.(mutants);
  for (const mutant of mutants) {
    const status = STATUS_NAMES[mutant.status] ?? 'Unknown';
    const filePath =
      status === 'Killed' && judge === undefined
        ? undefined
        : resolvePath(mutant.className, mutant.sourceFile);
    if (judge?.(mutant, filePath) !== undefined) {
      leftOut += 1;
      continue;
    }
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (status !== 'Killed' && filePath !== undefined) {
      addToGroup(groups, { mutant, status, filePath });
    }
  }
  return { groups, statusCounts, leftOut };
}

function addToGroup(groups, { mutant, status, filePath }) {
  const key = [
    withoutSyntheticNumbers(simpleClassName(mutant.className)),
    `${withoutSyntheticNumbers(mutant.method)}${simpleDescriptor(mutant.methodDescription)}`,
    mutant.mutatorName,
    withoutSyntheticNumbers(withoutPackages(mutant.description)),
  ].join('|');
  const groupKey = `${status}\0${filePath}\0${key}`;
  const group = groups.get(groupKey) ?? [];
  group.push({ mutant, status, key, filePath });
  groups.set(groupKey, group);
}

const INITIALIZER_LAMBDA = /^lambda\$new\$\d+$/u;

function mutantSymbol(mutant, filePath, functionAt) {
  const symbol = `${simpleClassName(mutant.className)}#${mutant.method}${simpleDescriptor(mutant.methodDescription)}`;
  return INITIALIZER_LAMBDA.test(mutant.method)
    ? (functionAt?.(filePath, mutant.line) ?? symbol)
    : symbol;
}

function neutralMutants(groups, functionAt) {
  const neutral = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.mutant.line - b.mutant.line || a.mutant.block - b.mutant.block);
    for (const [index, { mutant, status, key, filePath }] of group.entries()) {
      neutral.push({
        path: filePath,
        identity: `${key}#${String(index + 1)}`,
        status,
        label: `${mutant.mutatorName}: ${mutant.description}`,
        symbol: mutantSymbol(mutant, filePath, functionAt),
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

function leftOutSummary(count, tool) {
  return count === 0
    ? []
    : [
        {
          tool,
          rule: 'mutation-summary',
          path: '.',
          identity: 'status:GeneratedCode',
          message: 'Mutants in compiler-generated code, left out',
          classification: 'descriptive',
          metric: { name: 'GeneratedCode', value: count },
        },
      ];
}

function simpleClassName(className) {
  return className.slice(className.lastIndexOf('.') + 1);
}

function simpleDescriptor(descriptor) {
  return descriptor.replaceAll(/L(?:[\w$]+\/)+([\w$]+;)/g, 'L$1');
}

function withoutPackages(text) {
  return text.replaceAll(/(?:[\w$]+\/)+([\w$]+)/g, '$1');
}

function withoutSyntheticNumbers(name) {
  return name.replaceAll(/\$\d+(?!\w)/gu, '');
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
    mutatorName: mutator(field('mutator') ?? 'unknown'),
    description: field('description') ?? '',
    line: Number.parseInt(field('lineNumber') ?? '', 10) || 0,
    block: Number.parseInt((field('blocks') ?? '').match(/\d+/)?.[0] ?? '', 10) || 0,
  };
}
