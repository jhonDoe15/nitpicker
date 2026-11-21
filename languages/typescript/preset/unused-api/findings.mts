import type { Finding } from '../../../../shared/values/findings.mts';
import {
  type MemberSite,
  type RegistryData,
  type TargetData,
  registryData,
} from './engine/registry-data.mts';
import type { FileInfo, Reference, Registry } from './typed/context-types.mts';
import {
  MESSAGES,
  UNUSED_API_RULE_IDS,
  UNUSED_OPTION_SCOPES,
  exceptionText,
  messageFields,
  occurrenceCounter,
} from './typed/finding-views.mts';

type IsExcepted = (rule: string, ...candidates: readonly unknown[]) => boolean;
type FindingContext = {
  readonly owned: ReadonlyMap<string, FileInfo>;
  readonly analyzerName: string;
  readonly isExcepted: IsExcepted;
};
type State = FindingContext & {
  readonly cloned: readonly Reference[];
  readonly nextOccurrence: (key: string) => number;
};

const RULES = {
  component: { rule: UNUSED_API_RULE_IDS.unusedProp, message: MESSAGES.unusedProp },
  function: { rule: UNUSED_API_RULE_IDS.unusedOption, message: MESSAGES.unusedOption },
};

function countsFor(target: TargetData): (reference: Reference) => boolean {
  const published = target.package?.published === true;
  const packageDir = target.package?.dir;
  return (reference) =>
    reference.role === 'production' || (published && reference.packageDir === packageDir);
}

function passedNames(target: TargetData, cloned: readonly Reference[]): Set<string> | undefined {
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

function memberFinding({
  target,
  member,
  context,
}: {
  readonly target: TargetData;
  readonly member: MemberSite;
  readonly context: State;
}): Finding {
  const { rule, message } = RULES[target.kind];
  const file = context.owned.get(member.fileName);
  if (file === undefined) {
    throw new TypeError(`Unowned declaration of ${target.name}.${member.name}`);
  }
  const symbol = `${target.name}.${member.name}`;
  const occurrence = context.nextOccurrence(`${rule}\0${file.path}\0${symbol}`);
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
    location: { line: member.line },
  };
}

function targetFindings(target: TargetData, context: State): Finding[] {
  const passed = passedNames(target, context.cloned);
  if (passed === undefined) {
    return [];
  }
  return target.members
    .filter(({ name }) => !passed.has(name))
    .map((member) => memberFinding({ target, member, context }))
    .filter((finding) => !context.isExcepted(finding.rule, finding.path));
}

export function registryDataFindings(registry: RegistryData, context: FindingContext): Finding[] {
  const state = { ...context, cloned: registry.cloned, nextOccurrence: occurrenceCounter() };
  return registry.targets
    .flatMap((target) => targetFindings(target, state))
    .toSorted(
      (left, right) =>
        left.path.localeCompare(right.path) || left.identity.localeCompare(right.identity),
    );
}

export function unusedApiFindings(registry: Registry, context: FindingContext): Finding[] {
  return registryDataFindings(registryData(registry), context);
}
