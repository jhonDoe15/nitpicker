import { indentOf } from '../../../../../shared/fix/recipes/extract/text.mjs';
import { codeParts, field, parametersOf } from './syntax.mjs';

const STEP = '    ';

function replacedBody(body, holes) {
  const base = body.startIndex;
  const replacements = holes.flatMap((hole) =>
    hole.occurrences.map(({ a }) => ({
      start: a.startIndex - base,
      end: a.endIndex - base,
      text: hole.name,
    })),
  );
  return replacements
    .toSorted((left, right) => right.start - left.start)
    .reduce(
      (text, { start, end, text: name }) => text.slice(0, start) + name + text.slice(end),
      body.text,
    );
}

function throwsText(method) {
  const clause = codeParts(method).find((child) => child.type === 'throws');
  return clause === undefined ? '' : ` ${clause.text.replaceAll(/\s+/gu, ' ')}`;
}

export function helperText({ method, holes, name, isStatic }) {
  const parameters = [
    ...parametersOf(method).map((parameter) => parameter.text.replaceAll(/\s+/gu, ' ')),
    ...holes.map((hole) => `${hole.type} ${hole.name}`),
  ];
  const type = field(method, 'type').text;
  const head = `private ${isStatic ? 'static ' : ''}${type} ${name}(${parameters.join(', ')})`;
  return `${head}${throwsText(method)} ${replacedBody(field(method, 'body'), holes)}`;
}

function argumentsOf(method, side, holes) {
  const own = parametersOf(method).map((parameter) => field(parameter, 'name').text);
  const extra = holes.map((hole) => hole.occurrences[0][side === 0 ? 'a' : 'b'].text);
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
