import type { Node } from 'web-tree-sitter';
import type { Attempt, Edit, Pair } from '../../extract-types.mts';
import type { KotlinRequest } from './request.mts';
import { indentOf, withLineEndingOf } from '../../jvm-views.mts';
import { codeParts, nameCollisions, pairOf, present, squashed } from '../syntax.mts';
import { alignKotlin, type KotlinAligned } from './align/align.mts';
import {
  type ExtractedFunction,
  holeArguments,
  holeParameters,
  innerIndent,
  insertionAfter,
  movedComments,
  namedHelper,
  ownArguments,
  parameterTexts,
  replacedText,
} from './align/render.mts';
import { pairProblem } from './shape.mts';
import {
  bodyOf,
  declaredNames,
  localDeclarationProblem,
  modifierWords,
  parameterNodes,
  returnTypeOf,
} from './syntax.mts';

const UNIT = 'Unit';

function isBlock(body: Node): boolean {
  return codeParts(body)[0]?.type === 'block';
}

function returnTypeOfCopy(fn: Node): string | undefined {
  const type = returnTypeOf(fn);
  if (type !== undefined) {
    return squashed(type);
  }
  return isBlock(bodyOf(fn)) ? UNIT : undefined;
}

function returnProblem(methods: Pair): string | undefined {
  const [first, second] = methods.map(returnTypeOfCopy);
  if (first === undefined || second === undefined) {
    return 'a function has no declared return type';
  }
  return first === second ? undefined : 'the copies return different types';
}

function parametersOf(fn: Node): Node {
  return present(codeParts(fn).find(({ type }) => type === 'function_value_parameters'));
}

function parameterNames(fn: Node): string[] {
  return parameterNodes(fn).map((parameter) => present(codeParts(parameter)[0]).text);
}

function alignment(methods: Pair): Attempt<KotlinAligned> {
  const [a, b] = pairOf(methods);
  const [left, right] = [parameterNames(a), parameterNames(b)];
  return alignKotlin(
    [
      [parametersOf(a), parametersOf(b)],
      [bodyOf(a), bodyOf(b)],
    ],
    {
      locals: [declaredNames(a), declaredNames(b)],
      units: methods,
      prebound: left.map((name, index) => [name, present(right[index])] as const),
    },
  );
}

function sideEdit(
  fn: Node,
  side: number,
  context: { helper: ExtractedFunction; text: string; moved: readonly string[] },
): Edit {
  const { helper, text, moved } = context;
  const body = bodyOf(fn);
  const args = [...ownArguments(fn), ...holeArguments(helper.holes, side)].join(', ');
  const call = `${helper.name}(${args})`;
  if (!isBlock(body)) {
    return { start: body.startIndex, end: body.endIndex, text: `= ${call}` };
  }
  const base = indentOf(text, fn.startIndex);
  const inner = innerIndent(present(codeParts(body)[0]), text, base);
  const isUnit = returnTypeOfCopy(fn) === UNIT;
  const comments = moved.map((comment) => `${inner}${comment}\n`).join('');
  return {
    start: body.startIndex,
    end: body.endIndex,
    text: `{\n${comments}${inner}${isUnit ? '' : 'return '}${call}\n${base}}`,
  };
}

function helperText(fn: Node, helper: ExtractedFunction, text: string): string {
  const suspend = modifierWords(fn).includes('suspend') ? 'suspend ' : '';
  const parameters = [...parameterTexts(fn), ...holeParameters(helper.holes)].join(', ');
  const type = returnTypeOf(fn);
  const returns = type === undefined ? '' : `: ${type.text}`;
  const body = replacedText(bodyOf(fn), text, helper.holes);
  return `private ${suspend}fun ${helper.name}(${parameters})${returns} ${body}`;
}

function bodyProblem(methods: Pair): string | undefined {
  const bodies = methods.map(bodyOf);
  const found = bodies.map(localDeclarationProblem).find((problem) => problem !== undefined);
  const moved = movedComments(present(bodies[0]), present(bodies[1]));
  return (
    found ??
    (moved.length > 0 && !isBlock(present(bodies[0])) ? 'a comment would be lost' : undefined)
  );
}

function checkedAlignment(request: KotlinRequest): Attempt<KotlinAligned> {
  const { methods } = request;
  const problem = pairProblem(methods) ?? returnProblem(methods) ?? bodyProblem(methods);
  if (problem !== undefined) {
    return { declined: problem };
  }
  const aligned = alignment(methods);
  return aligned.declined === undefined && aligned.holes.length !== request.engineHoles
    ? { declined: 'the differing values do not match the ones the rule found' }
    : aligned;
}

function editsOf(request: KotlinRequest, helper: ExtractedFunction): Edit[] {
  const { methods, text } = request;
  const [first, second] = pairOf(methods);
  const moved = movedComments(bodyOf(first), bodyOf(second));
  return [
    sideEdit(first, 0, { helper, text, moved: [] }),
    sideEdit(second, 1, { helper, text, moved }),
    insertionAfter(first, helperText(first, helper, text), text),
  ].map((edit) => ({ ...edit, text: withLineEndingOf(text, edit.text) }));
}

export function wholeExtraction(request: KotlinRequest): Attempt<{ edits: Edit[] }> {
  const aligned = checkedAlignment(request);
  if (aligned.declined !== undefined) {
    return aligned;
  }
  const { root, claimed } = request;
  const helper = namedHelper(
    { label: request.label, holes: aligned.holes },
    new Set([...nameCollisions(root), ...claimed]),
  );
  if (helper === undefined) {
    return { declined: 'the name of the shared function would collide' };
  }
  claimed.add(helper.name);
  return { edits: editsOf(request, helper) };
}
