import { indentOf } from '../../../../../shared/fix/recipes/extract/text.mjs';
import { rewritten } from './creation/rewrite.mjs';
import { supplierOf } from './holes/deferred.mjs';
import { codeParts, field, parametersOf, suppressions } from './syntax.mjs';

const STEP = '    ';

export const NO_SHAPE = {
  rules: new Map(),
  typeParams: [],
  lead: [],
  tail: [],
  throws: [],
  interfaces: [],
};

function useOf(hole) {
  return hole.kind === 'deferred' ? `${hole.name}.${supplierOf(hole).accessor}()` : hole.name;
}

function holeRules(holes) {
  return new Map(
    holes.flatMap((hole) => hole.occurrences.map(({ a }) => [a.id, () => useOf(hole)])),
  );
}

export function replacedText(body, holes) {
  const base = body.startIndex;
  const replacements = holes.flatMap((hole) =>
    hole.occurrences
      .filter(
        ({ a }) =>
          a.startIndex >= body.startIndex && a.endIndex <= body.startIndex + body.text.length,
      )
      .map(({ a }) => ({
        start: a.startIndex - base,
        end: a.endIndex - base,
        text: useOf(hole),
      })),
  );
  return replacements
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (text, { start, end, text: name }) => text.slice(0, start) + name + text.slice(end),
      body.text,
    );
}

function renderedText(node, holes, rules) {
  return rewritten(node, new Map([...holeRules(holes), ...rules]));
}

export function throwsText(method, added = []) {
  const clause = codeParts(method).find((child) => child.type === 'throws');
  const own = clause === undefined ? '' : clause.text.replaceAll(/\s+/gu, ' ');
  if (added.length === 0) {
    return own === '' ? '' : ` ${own}`;
  }
  return own === '' ? ` throws ${added.join(', ')}` : ` ${own}, ${added.join(', ')}`;
}

function squashedText(text) {
  return text.replaceAll(/\s+/gu, ' ');
}

function holeExtra(hole, replaced) {
  function argument(side) {
    const { text } = hole.occurrences[0][side === 0 ? 'a' : 'b'];
    return hole.kind === 'deferred' ? `() -> ${text}` : text;
  }
  if (hole.kind !== 'deferred') {
    return { declaration: `${hole.type} ${hole.name}`, argument };
  }
  const typeText = hole.typeNode === undefined ? hole.type : squashedText(replaced(hole.typeNode));
  return { declaration: `${supplierOf(hole, typeText).type} ${hole.name}`, argument };
}

function outdented(text, width) {
  const margin = ' '.repeat(width);
  return text
    .split('\n')
    .map((line, index) => (index > 0 && line.startsWith(margin) ? line.slice(width) : line))
    .join('\n');
}

function extrasOf({ holes, shape = NO_SHAPE }, replaced) {
  return [...shape.lead, ...holes.map((hole) => holeExtra(hole, replaced)), ...shape.tail];
}

function replacerOf({ holes, typeHoles, shape = NO_SHAPE }) {
  return (node) => renderedText(node, [...holes, ...typeHoles], shape.rules);
}

export function extrasFor(request) {
  return extrasOf(request, replacerOf(request));
}

export function helperText(request) {
  const { method, typeHoles, name, isStatic, outdent = 0, shape = NO_SHAPE } = request;
  const { visibility = 'private' } = request;
  const replaced = replacerOf(request);
  const parameters = [
    ...parametersOf(method).map((parameter) => squashedText(replaced(parameter))),
    ...extrasOf(request, replaced).map(({ declaration }) => declaration),
  ];
  const params = [
    ...typeHoles.filter(({ usage }) => usage !== 'exception').map((hole) => hole.name),
    ...shape.typeParams,
  ];
  const generic = params.length === 0 ? '' : `<${params.join(', ')}> `;
  const type = replaced(field(method, 'type'));
  const modifiers = [visibility, isStatic ? 'static' : ''].filter((word) => word !== '').join(' ');
  const suppressed = suppressions(method)
    .map((annotation) => `${annotation} `)
    .join('');
  const lead = `${suppressed}${modifiers} ${generic}${type} ${name}`;
  const throwing = throwsText(method, shape.throws);
  const head = signatureText({ lead, parameters, throwing, indent: request.indent ?? '' });
  return `${head} ${outdented(replaced(field(method, 'body')), outdent)}`;
}

const WIDTH = 120;

function signatureText({ lead, parameters, throwing, indent }) {
  const flat = `${lead}(${parameters.join(', ')})${throwing}`;
  if (indent.length + flat.length + 2 <= WIDTH || parameters.length === 0) {
    return flat;
  }
  const margin = `${indent}${indent === '' ? STEP : indent}${indent === '' ? STEP : indent}`;
  return `${lead}(\n${margin}${parameters.join(`,\n${margin}`)})${throwing}`;
}

function bodyIndent(body, text, base) {
  const first = codeParts(body).find((child) => child.type !== '{' && child.type !== '}');
  return first === undefined ? `${base}${STEP}` : indentOf(text, first.startIndex);
}

export function bodyEdit({ method, side, name, text, extras, qualifier = '', moved = [] }) {
  const body = field(method, 'body');
  const base = indentOf(text, method.startIndex);
  const own = parametersOf(method).map((parameter) => field(parameter, 'name').text);
  const args = [...own, ...extras.map((extra) => extra.argument(side))].join(', ');
  const call = `${qualifier}${name}(${args});`;
  const isVoid = field(method, 'type').type === 'void_type';
  const inner = bodyIndent(body, text, base);
  const comments = moved.map((comment) => `${inner}${comment}\n`).join('');
  return {
    start: body.startIndex,
    end: body.endIndex,
    text: `{\n${comments}${inner}${isVoid ? '' : 'return '}${call}\n${base}}`,
  };
}

export function insertion({ method, helper, text }) {
  const at = method.endIndex;
  return { start: at, end: at, text: `\n\n${indentOf(text, method.startIndex)}${helper}` };
}
