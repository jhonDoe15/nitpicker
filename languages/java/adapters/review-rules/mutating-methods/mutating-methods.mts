import { findingFactory } from '../../kotlin/review-rules/review-finding.mts';
import { isDomain } from '../../domain/domain-roles.mts';
import { mainSourceTexts, packageOf } from '../java-sources.mts';
import { frameAt, parseSource, splitTopLevel } from '../max-value-sums/source-file.mts';
import { javaFormsOf, kindOfType, kotlinFormsOf, mutates } from './mutators.mts';
import type { Kind } from './mutators.mts';
import type { ReviewFinding } from '../../kotlin/review-rules/typed/review-finding-types.mts';
import type { MainSourceOptions } from '../java-sources.mts';
import type { Frame, SourceFile, Span } from '../max-value-sums/sum-types.mts';
import type { Token } from '../../reuse/jvm-reuse-types.mts';

export const MUTATING_METHOD_RULE = 'MutatingMethodInDomain';
export const MUTATING_METHOD_EXCEPTION_RULE = `pmd/${MUTATING_METHOD_RULE}`;

type Given = { readonly name: string; readonly type: string; readonly kind: Kind };
type Mutation = { readonly line: number; readonly given: Given; readonly method: string };

const MEMBER_ACCESS = new Set(['.', '?.']);

const MODIFIERS = new Set(['final', 'val', 'vararg']);

function withoutAnnotations(tokens: readonly Token[]): Token[] {
  return tokens.filter(
    (token, index) =>
      token.text !== '@' &&
      tokens[index - 1]?.text !== '@' &&
      !MODIFIERS.has(token.text),
  );
}

function typeBefore(tokens: readonly Token[]): string | undefined {
  const cleaned = withoutAnnotations(tokens);
  return cleaned.find(
    (token, index) => token.kind === 'identifier' && cleaned[index + 1]?.text !== '.',
  )?.text;
}

function givenOf(source: SourceFile, segment: Span): Given | undefined {
  const { tokens, kotlin } = source;
  const part = tokens.slice(segment.from, segment.to);
  const colon = part.findIndex(({ text }) => text === ':');
  const name = kotlin ? part[colon - 1] : part.filter(({ kind }) => kind === 'identifier').at(-1);
  const type = typeBefore(kotlin ? part.slice(colon + 1) : part);
  const kind = kotlin && colon < 0 ? undefined : kindOfType(type);
  return name === undefined || type === undefined || kind === undefined
    ? undefined
    : { name: name.text, type, kind };
}

function reassigned(source: SourceFile, body: Span, name: string): boolean {
  const { tokens } = source;
  return tokens
    .slice(body.from, body.to)
    .some(
      ({ text }, offset) =>
        text === name &&
        tokens[body.from + offset + 1]?.text === '=' &&
        !MEMBER_ACCESS.has(tokens[body.from + offset - 1]?.text ?? ''),
    );
}

function givenValues(source: SourceFile, frame: Frame): Given[] {
  const close = source.partner[frame.open] ?? -1;
  return splitTopLevel(source, { from: frame.open + 1, to: close }).flatMap((segment) => {
    const given = givenOf(source, segment);
    return given === undefined || reassigned(source, frame.body, given.name) ? [] : [given];
  });
}

const RECEIVER = 2;
const BEFORE_RECEIVER = 3;

function opensCall(source: SourceFile, index: number): boolean {
  const next = source.tokens[index + 1]?.text;
  return next === '(' || (source.kotlin && next === '{');
}

function mutationsIn(source: SourceFile, frame: Frame): Mutation[] {
  const { tokens } = source;
  const values = new Map(givenValues(source, frame).map((given) => [given.name, given]));
  return tokens.slice(frame.body.from, frame.body.to).flatMap((method, offset): Mutation[] => {
    const index = frame.body.from + offset;
    const given = values.get(tokens[index - RECEIVER]?.text ?? '');
    return method.kind === 'identifier' &&
      opensCall(source, index) &&
      MEMBER_ACCESS.has(tokens[index - 1]?.text ?? '') &&
      !MEMBER_ACCESS.has(tokens[index - BEFORE_RECEIVER]?.text ?? '') &&
      given !== undefined &&
      mutates(given.kind, method.text) &&
      frameAt(source, index) === frame
      ? [{ line: method.line, given, method: method.text }]
      : [];
  });
}

function mutationsOf(source: SourceFile): Mutation[] {
  return source.frames.flatMap((frame) => mutationsIn(source, frame));
}

function mutationMessage({ given, method }: Mutation, kotlin: boolean): string {
  const { name, type, kind } = given;
  const forms = kotlin ? kotlinFormsOf(kind) : javaFormsOf(kind);
  return (
    `Domain code does not change a value it was given, and \`${name}.${method}(...)\` changes the ` +
    `\`${type}\` parameter \`${name}\`; leave it as it is and build a new one instead: ${forms}. ` +
    'A collection created and filled in the same function is allowed.'
  );
}

export function readMutatingMethodFindings(
  projectRoot: string,
  options: MainSourceOptions,
): ReviewFinding[] {
  const finding = findingFactory();
  return mainSourceTexts(projectRoot, options)
    .filter(({ text }) => isDomain({ packageName: packageOf(text) }))
    .flatMap(({ file, text, kotlin }) =>
      mutationsOf(parseSource(text, { file, kotlin })).map((mutation) =>
        finding({
          rule: MUTATING_METHOD_RULE,
          file,
          line: mutation.line,
          symbol: mutation.given.name,
          key: `${file}:${mutation.given.name}.${mutation.method}`,
          message: mutationMessage(mutation, kotlin),
        }),
      ),
    );
}

export const MUTATING_METHOD_ALLOWED = mutationMessage(
  {
    line: 0,
    given: { name: 'items', type: 'List', kind: 'list' },
    method: 'add',
  },
  false,
);
