import type TypeScript from 'typescript';
import type { Finding } from '../../../../shared/values/findings.mts';
import type { FileInfo, Reference, Registry, Target } from './typed/context-types.mts';
import {
  MESSAGES,
  UNUSED_API_RULE_IDS,
  UNUSED_OPTION_SCOPES,
  exceptionText,
  messageFields,
  nextOccurrence,
} from './typed/finding-views.mts';

type IsExcepted = (rule: string, ...candidates: readonly unknown[]) => boolean;
type FindingContext = {
  readonly owned: ReadonlyMap<string, FileInfo>;
  readonly analyzerName: string;
  readonly isExcepted: IsExcepted;
};
type State = FindingContext & {
  readonly cloned: readonly Reference[];
  readonly occurrences: Map<string, number>;
};

const RULES = {
  component: { rule: UNUSED_API_RULE_IDS.unusedProp, message: MESSAGES.unusedProp },
  function: { rule: UNUSED_API_RULE_IDS.unusedOption, message: MESSAGES.unusedOption },
};

function countsFor(target: Target): (reference: Reference) => boolean {
  const published = target.package?.published === true;
  const packageDir = target.package?.dir;
  return (reference) =>
    reference.role === 'production' || (published && reference.packageDir === packageDir);
}

function passedNames(target: Target, cloned: readonly Reference[]): Set<string> | undefined {
  const counts = countsFor(target);
  const references = target.refs.filter(counts);
  const calls = references.filter(({ kind }) => kind === 'call');
  const passing = [
    ...references.filter(({ kind }) => kind !== 'escape'),
    ...(target.kind === 'component' ? cloned.filter(counts) : []),
  ];
  const isJudgeable =
    calls.length > 0 &&
    references.every(({ kind }) => kind !== 'escape') &&
    passing.every(({ passes }) => passes?.all !== true);
  return isJudgeable
    ? new Set(passing.flatMap(({ passes }) => [...(passes?.names ?? [])]))
    : undefined;
}

function declarationLine(declaration: TypeScript.Declaration): number {
  const sourceFile = declaration.getSourceFile();
  return sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
}

function memberFinding({
  target,
  member,
  declaration,
  context,
}: {
  readonly target: Target;
  readonly member: string;
  readonly declaration: TypeScript.Declaration;
  readonly context: State;
}): Finding {
  const { rule, message } = RULES[target.kind];
  const file = context.owned.get(declaration.getSourceFile().fileName);
  if (file === undefined) {
    throw new TypeError(`Unowned declaration of ${target.name}.${member}`);
  }
  const symbol = `${target.name}.${member}`;
  const occurrence = nextOccurrence(context.occurrences, `${rule}\0${file.path}\0${symbol}`);
  const scopes = UNUSED_OPTION_SCOPES.typescript;
  const scope = target.package?.published ? scopes.published : scopes.private;
  return {
    tool: context.analyzerName,
    rule,
    path: file.path,
    identity: occurrence === 1 ? symbol : `${symbol}#${String(occurrence)}`,
    ...messageFields(message, {
      name: symbol,
      scope,
      exception: exceptionText(rule, file.path),
    }),
    classification: 'enforceable',
    symbol,
    location: { line: declarationLine(declaration) },
  };
}

function targetFindings(target: Target, context: State): Finding[] {
  const passed = passedNames(target, context.cloned);
  if (passed === undefined) {
    return [];
  }
  return [...target.members]
    .filter(([member]) => !passed.has(member))
    .map(([member, declaration]) => memberFinding({ target, member, declaration, context }))
    .filter((finding) => !context.isExcepted(finding.rule, finding.path));
}

export function unusedApiFindings(registry: Registry, context: FindingContext): Finding[] {
  const state = { ...context, cloned: registry.cloned, occurrences: new Map() };
  return registry.targets
    .flatMap((target) => targetFindings(target, state))
    .toSorted(
      (left, right) =>
        left.path.localeCompare(right.path) || left.identity.localeCompare(right.identity),
    );
}
