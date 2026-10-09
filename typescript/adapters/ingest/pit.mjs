import { ENFORCED_MUTATION_STATUSES, mutantRuleId } from '../../shared/policy.mjs';
import { decodeEntities } from './common.mjs';

// PIT (pitest) XML mutation report -> findings, following the same mutation profile as the
// TypeScript preset (docs/mutation-testing.md): no score gate; each new surviving or uncovered
// mutant fails, every other non-killed status is report-only, and per-status counts are a
// descriptive `mutation-summary`.
//
// Identity never contains a line number. A mutant is identified by what it is: the mutated class,
// method (name and descriptor), mutator and mutation description, plus its position among the
// mutants with that same key in source order (`#n`, by line and then block index). Inserting code
// above a mutant keeps it; adding a second identical mutation in the same method adds a new
// occurrence.
//
// `options.resolvePath(className, sourceFile)` maps a mutated class to its project-relative source
// file; mutants whose source cannot be found (generated code) are skipped.

// PIT status -> the status names used by the Stryker-based mutation area.
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

  const statusCounts = new Map();
  const groups = new Map();
  const findings = [];
  for (const mutant of mutants) {
    const status = STATUS_NAMES[mutant.status] ?? 'Unknown';
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (status === 'Killed') {
      continue;
    }
    const filePath = resolvePath(mutant.className, mutant.sourceFile);
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
  for (const group of groups.values()) {
    group.sort((a, b) => a.mutant.line - b.mutant.line || a.mutant.block - b.mutant.block);
    group.forEach(({ mutant, status, key, filePath }, index) => {
      findings.push({
        tool,
        rule: mutantRuleId(status),
        path: filePath,
        identity: `${key}#${String(index + 1)}`,
        message: `${status} ${mutator(mutant.mutator)}: ${mutant.description}`,
        classification: ENFORCED_MUTATION_STATUSES.includes(status) ? 'enforceable' : 'descriptive',
        symbol: `${mutant.className}#${mutant.method}${mutant.methodDescription}`,
        ...(mutant.line >= 1 ? { location: { line: mutant.line } } : {}),
      });
    });
  }
  for (const [status, value] of statusCounts) {
    findings.push({
      tool,
      rule: 'mutation-summary',
      path: '.',
      identity: `status:${status}`,
      message: `${status} mutants`,
      classification: 'descriptive',
      metric: { name: status, value },
    });
  }
  return { findings };
}

function mutator(qualifiedName) {
  return qualifiedName.slice(qualifiedName.lastIndexOf('.') + 1);
}

function parseMutant(attributes, body) {
  const status = /\bstatus\s*=\s*['"]([^'"]*)['"]/.exec(attributes)?.[1];
  const field = (name) => {
    const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(body);
    return match === null ? undefined : decodeEntities(match[1]);
  };
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
