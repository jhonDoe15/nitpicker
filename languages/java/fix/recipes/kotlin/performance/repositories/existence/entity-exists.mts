import { leftIsolated, rightIsolated } from '../../../shared/boundaries.mts';
import { kotlinRecipe } from '../../../shared/kotlin-recipe.mts';
import { splitArguments } from '../../../shared/kotlin-scan.mts';
import type { KotlinEdit, KotlinFound, ScannedKotlin, Span } from '../../../shared/kotlin-scan.mts';
import { removalSpan } from '../../../shared/spans.mts';
import { isRepositoryName } from '../declared-names.mts';

const NAME = String.raw`(?:this\s*\.\s*)?[A-Za-z_]\w*`;
const FIND = new RegExp(
  String.raw`(?<![\w.)\]?])(${NAME})\s*\.\s*(findById|findByIdOrNull)\s*\(`,
  'gu',
);
const OPTIONAL_TEST = /^\s*\.\s*(isPresent|isEmpty)\b(?:\s*\(\s*\))?/u;
const NULL_TEST = /^\s*(!=|==)\s*null\b/u;
const NAMED_ARGUMENT = /^\s*[A-Za-z_]\w*\s*=(?!=)/u;
const CONTINUES = /^\s*(?:\.|\?\.|!!|\[|\(|as\b|\{)/u;
const IMPORT_LINE =
  /^[ \t]*import[ \t]+org\.springframework\.data\.repository\.findByIdOrNull(?:[ \t]*;)?[ \t]*$/mu;
const OR_NULL_USE = /\bfindByIdOrNull\b/gu;

type Site = {
  readonly orNull: boolean;
  readonly offset: number;
  readonly edit: KotlinEdit;
};

function leftOk(code: string, start: number, negated: boolean): boolean {
  const before = code.slice(0, start).trimEnd();
  if (before.endsWith('!')) {
    return !(negated || before.endsWith('!!'));
  }
  return leftIsolated(code, start) || /(?:&&|\})$/u.test(before);
}

function rightOk(code: string, end: number): boolean {
  return rightIsolated(code, end) || /^\s*&&/u.test(code.slice(end));
}

type Call = {
  readonly close: number;
  readonly argument: Span;
  readonly test: RegExpExecArray;
};

function callOf(code: string, match: RegExpExecArray): Call | undefined {
  const [head = '', receiver = '', method = ''] = match;
  const { close, parts } = splitArguments(code, match.index + head.length - 1);
  const [argument] = parts;
  const rest = code.slice(close + 1);
  const test = method === 'findByIdOrNull' ? NULL_TEST.exec(rest) : OPTIONAL_TEST.exec(rest);
  if (
    argument === undefined ||
    parts.length !== 1 ||
    test === null ||
    NAMED_ARGUMENT.test(code.slice(argument.start, argument.end)) ||
    !isRepositoryName(code, receiver.replace(/^this\s*\.\s*/u, ''))
  ) {
    return undefined;
  }
  return { close, argument, test };
}

function siteAt(scanned: ScannedKotlin, match: RegExpExecArray): Site | undefined {
  const { code, source } = scanned;
  const [head = '', receiver = '', method = ''] = match;
  const call = callOf(code, match);
  if (call === undefined) {
    return undefined;
  }
  const negated = call.test[1] === 'isEmpty' || call.test[1] === '==';
  const end = call.close + 1 + call.test[0].length;
  if (
    !leftOk(code, match.index, negated) ||
    !rightOk(code, end) ||
    CONTINUES.test(code.slice(end))
  ) {
    return undefined;
  }
  const argument = source.slice(call.argument.start, call.argument.end);
  const text = `${negated ? '!' : ''}${receiver.replaceAll(/\s+/gu, '')}.existsById(${argument})`;
  const offset = match.index + head.lastIndexOf(method);
  return { orNull: method === 'findByIdOrNull', offset, edit: { start: match.index, end, text } };
}

function orNullImport(scanned: ScannedKotlin, sites: readonly Site[]): KotlinEdit | undefined {
  const { code, source } = scanned;
  const line = IMPORT_LINE.exec(code);
  const uses = [...code.matchAll(OR_NULL_USE)].length;
  const rewritten = sites.filter(({ orNull }) => orNull).length;
  if (line === null || rewritten === 0 || uses !== rewritten + 1) {
    return undefined;
  }
  const { start, end } = removalSpan(source, line.index, line.index + line[0].length);
  const lone = source.slice(Math.max(0, start - 2), start) === '\n\n' && source[end] === '\n';
  return { start, end: lone ? end + 1 : end, text: '' };
}

export const entityExistsRecipe = kotlinRecipe({
  id: 'kotlin-entity-loaded-for-existence',
  rules: [{ tool: 'effects', rule: 'EntityLoadedForExistence' }],
  safety: 'review',
  keepComments: true,
  find(scanned): readonly KotlinFound[] {
    const sites = [...scanned.code.matchAll(FIND)].flatMap((match) => {
      const site = siteAt(scanned, match);
      return site === undefined ? [] : [site];
    });
    const removal = orNullImport(scanned, sites);
    if (removal === undefined) {
      return sites.map(({ offset, edit }) => ({ offset, edits: [edit] }));
    }
    const [first, ...others] = sites.filter(({ orNull }) => orNull);
    const plain = sites.filter(({ orNull }) => !orNull);
    return [
      ...plain.map(({ offset, edit }) => ({ offset, edits: [edit] })),
      ...(first === undefined
        ? []
        : [
            {
              offset: first.offset,
              alsoOffsets: others.map(({ offset }) => offset),
              edits: [first.edit, ...others.map(({ edit }) => edit), removal],
            },
          ]),
    ];
  },
});
