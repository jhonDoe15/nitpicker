import { mutantFindings } from '../../../shared/rules/mutation.mjs';
import { decodeEntities } from '../../../shared/ingest/common.mjs';
import { hash } from '../../../shared/rules/finding-helpers.mjs';
import { listOf, textOf } from '../../../shared/values/readers.mts';

type Mutant = {
  readonly status: string;
  readonly className: string;
  readonly sourceFile: string;
  readonly method: string;
  readonly methodDescription: string;
  readonly mutatorName: string;
  readonly description: string;
  readonly line: number;
  readonly block: number;
};
type ResolvePath = (className: string, sourceFile: string) => unknown;
type Judge = (mutant: Mutant, filePath: unknown) => unknown;
type PitOptions = {
  readonly tool?: string;
  readonly resolvePath?: ResolvePath;
  readonly generated?: (mutants: readonly Mutant[]) => Judge | undefined;
  readonly functionAt?: (filePath: string, line: number) => unknown;
  readonly sourceText?: (filePath: string) => unknown;
};
type Grouped = { readonly mutant: Mutant; readonly status: string; readonly filePath: string };
type GroupEntry = Grouped & { readonly key: string };
type Groups = Map<string, GroupEntry[]>;
type LineAt = (filePath: string, line: number) => string | undefined;

const PIT_WAY_OUT =
  'If no input can tell the two apart (a compareTo boundary, a discarded lambda return, a field set to the value it already has, a redundant trim() or sorted()), simplify the code so this mutant disappears.';

const STATUS_NAMES: Readonly<Record<string, string>> = {
  KILLED: 'Killed',
  SURVIVED: 'Survived',
  NO_COVERAGE: 'NoCoverage',
  TIMED_OUT: 'Timeout',
  MEMORY_ERROR: 'RuntimeError',
  RUN_ERROR: 'RuntimeError',
  NON_VIABLE: 'CompileError',
  STARTED: 'Ignored',
};

export function ingestPit(xml: string, options: PitOptions = {}): { findings: unknown[] } {
  if (!/<mutations[\s>]|<mutations\/>/u.test(xml)) {
    throw new TypeError('PIT report root element must be <mutations>');
  }
  const tool = options.tool ?? 'pit';
  const resolvePath = options.resolvePath ?? keepSourceFile;
  const generated = options.generated;
  const mutants = [...xml.matchAll(/<mutation\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mutation>)/gu)]
    .map(([, attributes = '', body = '']) => parseMutant(attributes, body))
    .filter((mutant) => mutant !== undefined);

  const { groups, statusCounts, leftOut } = groupMutants(mutants, { resolvePath, generated });
  const findings = listOf(
    mutantFindings(neutralMutants(groups, options), { tool, wayOut: PIT_WAY_OUT }),
  );
  return {
    findings: [
      ...findings,
      ...statusSummaries(statusCounts, tool),
      ...leftOutSummary(leftOut, tool),
    ],
  };
}

function keepSourceFile(_className: string, sourceFile: string): unknown {
  return sourceFile;
}

function groupMutants(
  mutants: readonly Mutant[],
  {
    resolvePath,
    generated,
  }: { readonly resolvePath: ResolvePath; readonly generated: PitOptions['generated'] },
): { groups: Groups; statusCounts: Map<string, number>; leftOut: number } {
  const statusCounts = new Map<string, number>();
  const groups: Groups = new Map();
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
    if (status !== 'Killed' && typeof filePath === 'string') {
      addToGroup(groups, { mutant, status, filePath });
    }
  }
  return { groups, statusCounts, leftOut };
}

function addToGroup(groups: Groups, { mutant, status, filePath }: Grouped): void {
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

function mutantSymbol(
  mutant: Mutant,
  filePath: string,
  functionAt: PitOptions['functionAt'],
): unknown {
  const symbol = `${simpleClassName(mutant.className)}#${mutant.method}${simpleDescriptor(mutant.methodDescription)}`;
  return INITIALIZER_LAMBDA.test(mutant.method)
    ? (functionAt?.(filePath, mutant.line) ?? symbol)
    : symbol;
}

function lineReader(sourceText: PitOptions['sourceText']): LineAt {
  const files = new Map<string, string[] | undefined>();
  return (filePath, line) => {
    if (!files.has(filePath)) {
      const text = sourceText?.(filePath);
      files.set(filePath, typeof text === 'string' ? text.split(/\r?\n/u) : undefined);
    }
    return files.get(filePath)?.[line - 1]?.trim();
  };
}

function mutantAnchor(mutant: Mutant, filePath: string, lineAt: LineAt): string | undefined {
  const text = lineAt(filePath, mutant.line);
  return text === undefined || text === ''
    ? undefined
    : [mutant.mutatorName, withoutMethod(mutant.description), textOf(hash(text))].join('|');
}

function neutralMutants(groups: Groups, { functionAt, sourceText }: PitOptions): unknown[] {
  const lineAt = lineReader(sourceText);
  const neutral: unknown[] = [];
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
        anchor: mutantAnchor(mutant, filePath, lineAt),
      });
    }
  }
  return neutral;
}

function statusSummaries(statusCounts: ReadonlyMap<string, number>, tool: string): unknown[] {
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

function leftOutSummary(count: number, tool: string): unknown[] {
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

function simpleClassName(className: string): string {
  return className.slice(className.lastIndexOf('.') + 1);
}

function simpleDescriptor(descriptor: string): string {
  return descriptor.replaceAll(/L(?:[\w$]+\/)+([\w$]+;)/gu, 'L$1');
}

function withoutPackages(text: string): string {
  return text.replaceAll(/(?:[\w$]+\/)+([\w$]+)/gu, '$1');
}

function withoutSyntheticNumbers(name: string): string {
  return name.replaceAll(/\$\d+\b/gu, '');
}

function withoutMethod(description: string): string {
  return description.replaceAll(/(?:[\w$]+\/)*[\w$]+::[\w$<>]+/gu, '');
}

function mutator(qualifiedName: string): string {
  return qualifiedName.slice(qualifiedName.lastIndexOf('.') + 1);
}

function parseMutant(attributes: string, body: string): Mutant | undefined {
  const status = /\bstatus\s*=\s*['"]([^'"]*)['"]/u.exec(attributes)?.[1];
  function field(name: string): string | undefined {
    const match = new RegExp(`<${name}>([^<]*)</${name}>`, 'u').exec(body);
    return match === null ? undefined : textOf(decodeEntities(match[1] ?? ''));
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
    block: Number.parseInt(/\d+/u.exec(field('blocks') ?? '')?.[0] ?? '', 10) || 0,
  };
}
