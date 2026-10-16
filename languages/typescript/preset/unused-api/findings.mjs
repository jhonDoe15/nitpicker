import { MESSAGES, renderMessage } from '../../../../shared/policy.mjs';
import { exceptionText } from '../../../../shared/rules/exceptions.mjs';
import { nextOccurrence } from '../../../../shared/rules/finding-helpers.mjs';
import {
  UNUSED_API_RULE_IDS,
  UNUSED_API_SCOPES,
} from '../../../../shared/unused-api/unused-api-policy.mjs';

const RULES = {
  component: { rule: UNUSED_API_RULE_IDS.unusedProp, message: MESSAGES.unusedProp },
  function: { rule: UNUSED_API_RULE_IDS.unusedOption, message: MESSAGES.unusedOption },
};

function countsFor(target) {
  const published = target.package?.published === true;
  return (reference) =>
    reference.role === 'production' || (published && reference.packageDir === target.package?.dir);
}

function passedNames(target, cloned) {
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
    passing.every(({ passes }) => !passes.all);
  return isJudgeable ? new Set(passing.flatMap(({ passes }) => [...passes.names])) : undefined;
}

function declarationLine(declaration) {
  const sourceFile = declaration.getSourceFile();
  return sourceFile.getLineAndCharacterOfPosition(declaration.getStart(sourceFile)).line + 1;
}

function memberFinding({ target, member, declaration, context }) {
  const { rule, message } = RULES[target.kind];
  const file = context.owned.get(declaration.getSourceFile().fileName);
  const symbol = `${target.name}.${member}`;
  const occurrence = nextOccurrence(context.occurrences, `${rule}\0${file.path}\0${symbol}`);
  const scope = target.package?.published ? UNUSED_API_SCOPES.published : UNUSED_API_SCOPES.private;
  return {
    tool: context.analyzerName,
    rule,
    path: file.path,
    identity: occurrence === 1 ? symbol : `${symbol}#${String(occurrence)}`,
    message: renderMessage(message, {
      name: symbol,
      scope,
      exception: exceptionText(rule, file.path),
    }),
    classification: 'enforceable',
    symbol,
    location: { line: declarationLine(declaration) },
  };
}

function targetFindings(target, context) {
  const passed = passedNames(target, context.cloned);
  if (passed === undefined) return [];
  return [...target.members]
    .filter(([member]) => !passed.has(member))
    .map(([member, declaration]) => memberFinding({ target, member, declaration, context }))
    .filter((finding) => !context.isExcepted(finding.rule, finding.path));
}

/** The unused props and options of the registered targets, after their references are recorded. */
export function unusedApiFindings(registry, context) {
  const state = { ...context, cloned: registry.cloned, occurrences: new Map() };
  return registry.targets
    .flatMap((target) => targetFindings(target, state))
    .toSorted(
      (left, right) =>
        left.path.localeCompare(right.path) || left.identity.localeCompare(right.identity),
    );
}
