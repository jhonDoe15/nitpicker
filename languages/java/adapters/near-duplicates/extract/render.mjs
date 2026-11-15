import { indentOf } from '../../../../../shared/fix/recipes/extract/text.mjs';
import { supplierOf } from './holes/deferred.mjs';
import { codeParts, field, parametersOf } from './syntax.mjs';

const STEP = '    ';

function useOf(hole) {
  return hole.kind === 'deferred' ? `${hole.name}.${supplierOf(hole).accessor}()` : hole.name;
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

export function throwsText(method) {
  const clause = codeParts(method).find((child) => child.type === 'throws');
  return clause === undefined ? '' : ` ${clause.text.replaceAll(/\s+/gu, ' ')}`;
}

function holeParameter(hole, replaced) {
  if (hole.kind !== 'deferred') {
    return `${hole.type} ${hole.name}`;
  }
  const typeText = hole.typeNode === undefined ? hole.type : squashedText(replaced(hole.typeNode));
  return `${supplierOf(hole, typeText).type} ${hole.name}`;
}

function squashedText(text) {
  return text.replaceAll(/\s+/gu, ' ');
}

function outdented(text, width) {
  const margin = ' '.repeat(width);
  return text
    .split('\n')
    .map((line, index) => (index > 0 && line.startsWith(margin) ? line.slice(width) : line))
    .join('\n');
}

export function helperText({ method, holes, typeHoles, name, isStatic, outdent = 0 }) {
  const all = [...holes, ...typeHoles];
  function replaced(node) {
    return replacedText(node, all);
  }
  const parameters = [
    ...parametersOf(method).map((parameter) => squashedText(replaced(parameter))),
    ...holes.map((hole) => holeParameter(hole, replaced)),
  ];
  const generic =
    typeHoles.length === 0 ? '' : `<${typeHoles.map((hole) => hole.name).join(', ')}> `;
  const type = replaced(field(method, 'type'));
  const modifiers = `private ${isStatic ? 'static ' : ''}${generic}`;
  const head = `${modifiers}${type} ${name}(${parameters.join(', ')})`;
  return `${head}${throwsText(method)} ${outdented(replaced(field(method, 'body')), outdent)}`;
}

function argumentsOf(method, side, holes) {
  const own = parametersOf(method).map((parameter) => field(parameter, 'name').text);
  const extra = holes.map((hole) => {
    const { text } = hole.occurrences[0][side === 0 ? 'a' : 'b'];
    return hole.kind === 'deferred' ? `() -> ${text}` : text;
  });
  return [...own, ...extra].join(', ');
}

function bodyIndent(body, text, base) {
  const first = codeParts(body).find((child) => child.type !== '{' && child.type !== '}');
  return first === undefined ? `${base}${STEP}` : indentOf(text, first.startIndex);
}

export function bodyEdit({ method, side, name, holes, text }) {
  const body = field(method, 'body');
  const base = indentOf(text, method.startIndex);
  const call = `${name}(${argumentsOf(method, side, holes)});`;
  const isVoid = field(method, 'type').type === 'void_type';
  const inner = bodyIndent(body, text, base);
  return {
    start: body.startIndex,
    end: body.endIndex,
    text: `{\n${inner}${isVoid ? '' : 'return '}${call}\n${base}}`,
  };
}

export function insertion({ method, helper, text }) {
  const at = method.endIndex;
  return { start: at, end: at, text: `\n\n${indentOf(text, method.startIndex)}${helper}` };
}
