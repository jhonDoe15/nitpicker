import type { Node } from 'web-tree-sitter';
import type {
  Edit,
  Extra,
  HelperParts,
  HelperRequest,
  NamedValueHole,
  RenderHole,
  Renderer,
  Shape,
} from '../extract-types.mts';
import { indentOf, withReplacements } from '../jvm-views.mts';
import { rewritten } from './creation/rewrite.mts';
import { isBounded } from './holes/bounds.mts';
import { supplierOf } from './holes/deferred.mts';
import { codeParts, parametersOf, present, required, suppressions } from './syntax.mts';

const STEP = '    ';

export const NO_SHAPE: Shape = {
  rules: new Map<number, Renderer>(),
  typeParams: [],
  lead: [],
  tail: [],
  throws: [],
  interfaces: [],
};

function useOf(hole: RenderHole): string {
  return hole.kind === 'deferred' ? `${hole.name}.${supplierOf(hole).accessor}()` : hole.name;
}

function holeRules(holes: readonly RenderHole[]): Map<number, Renderer> {
  return new Map(
    holes.flatMap((hole) =>
      hole.occurrences.map(({ a }): [number, Renderer] => [a.id, () => useOf(hole)]),
    ),
  );
}

export function replacedText(
  body: { readonly startIndex: number; readonly text: string },
  holes: readonly RenderHole[],
): string {
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
  return withReplacements(body.text, replacements);
}

function renderedText(
  node: Node,
  holes: readonly RenderHole[],
  rules: ReadonlyMap<number, Renderer>,
): string {
  return rewritten(node, new Map([...holeRules(holes), ...rules]));
}

export function throwsText(method: Node, added: readonly string[] = []): string {
  const clause = codeParts(method).find((child) => child.type === 'throws');
  const own = clause === undefined ? '' : clause.text.replaceAll(/\s+/gu, ' ');
  if (added.length === 0) {
    return own === '' ? '' : ` ${own}`;
  }
  return own === '' ? ` throws ${added.join(', ')}` : ` ${own}, ${added.join(', ')}`;
}

function squashedText(text: string): string {
  return text.replaceAll(/\s+/gu, ' ');
}

function holeExtra(hole: NamedValueHole, replaced: (node: Node) => string): Extra {
  function argument(side: number): string {
    const { text } = present(hole.occurrences[0])[side === 0 ? 'a' : 'b'];
    return hole.kind === 'deferred' ? `() -> ${text}` : text;
  }
  if (hole.kind !== 'deferred') {
    return { declaration: `${hole.type} ${hole.name}`, argument };
  }
  const typeText = hole.typeNode === undefined ? hole.type : squashedText(replaced(hole.typeNode));
  return { declaration: `${supplierOf(hole, typeText).type} ${hole.name}`, argument };
}

function outdented(text: string, width: number): string {
  const margin = ' '.repeat(width);
  return text
    .split('\n')
    .map((line, index) => (index > 0 && line.startsWith(margin) ? line.slice(width) : line))
    .join('\n');
}

function extrasOf(
  { holes, shape = NO_SHAPE }: HelperParts,
  replaced: (node: Node) => string,
): Extra[] {
  return [...shape.lead, ...holes.map((hole) => holeExtra(hole, replaced)), ...shape.tail];
}

function replacerOf({ holes, typeHoles, shape = NO_SHAPE }: HelperParts): (node: Node) => string {
  return (node) => renderedText(node, [...holes, ...typeHoles], shape.rules);
}

export function extrasFor(request: HelperParts): Extra[] {
  return extrasOf(request, replacerOf(request));
}

export function helperText(request: HelperRequest): string {
  const { method, typeHoles, name, isStatic, outdent = 0, shape = NO_SHAPE } = request;
  const { visibility = 'private' } = request;
  const replaced = replacerOf(request);
  const parameters = [
    ...parametersOf(method).map((parameter) => squashedText(replaced(parameter))),
    ...extrasOf(request, replaced).map(({ declaration }) => declaration),
  ];
  const params = [
    ...typeHoles
      .filter((hole) => hole.usage !== 'exception' && !isBounded(hole))
      .map((hole) => {
        const bound = shape.bounds?.get(hole.name);
        return bound === undefined ? hole.name : `${hole.name} extends ${bound}`;
      }),
    ...shape.typeParams,
  ];
  const generic = params.length === 0 ? '' : `<${params.join(', ')}> `;
  const type = replaced(required(method, 'type'));
  const modifiers = [visibility, isStatic ? 'static' : ''].filter((word) => word !== '').join(' ');
  const suppressed = suppressions(method)
    .map((annotation) => `${annotation} `)
    .join('');
  const lead = `${suppressed}${modifiers} ${generic}${type} ${name}`;
  const throwing = throwsText(method, shape.throws);
  const head = signatureText({ lead, parameters, throwing, indent: request.indent ?? '' });
  return `${head} ${outdented(replaced(required(method, 'body')), outdent)}`;
}

const WIDTH = 120;

function signatureText({
  lead,
  parameters,
  throwing,
  indent,
}: {
  lead: string;
  parameters: readonly string[];
  throwing: string;
  indent: string;
}): string {
  const flat = `${lead}(${parameters.join(', ')})${throwing}`;
  if (indent.length + flat.length + 2 <= WIDTH || parameters.length === 0) {
    return flat;
  }
  const margin = `${indent}${indent === '' ? STEP : indent}${indent === '' ? STEP : indent}`;
  return `${lead}(\n${margin}${parameters.join(`,\n${margin}`)})${throwing}`;
}

function bodyIndent(body: Node, text: string, base: string): string {
  const first = codeParts(body).find((child) => child.type !== '{' && child.type !== '}');
  return first === undefined ? `${base}${STEP}` : indentOf(text, first.startIndex);
}

export function bodyEdit({
  method,
  side,
  name,
  text,
  extras,
  qualifier = '',
  moved = [],
}: {
  method: Node;
  side: number;
  name: string;
  text: string;
  extras: readonly Extra[];
  qualifier?: string;
  moved?: readonly string[];
}): Edit {
  const body = required(method, 'body');
  const base = indentOf(text, method.startIndex);
  const own = parametersOf(method).map((parameter) => required(parameter, 'name').text);
  const args = [...own, ...extras.map((extra) => extra.argument(side))].join(', ');
  const call = `${qualifier}${name}(${args});`;
  const isVoid = required(method, 'type').type === 'void_type';
  const inner = bodyIndent(body, text, base);
  const comments = moved.map((comment) => `${inner}${comment}\n`).join('');
  return {
    start: body.startIndex,
    end: body.endIndex,
    text: `{\n${comments}${inner}${isVoid ? '' : 'return '}${call}\n${base}}`,
  };
}

export function insertion({
  method,
  helper,
  text,
}: {
  method: Node;
  helper: string;
  text: string;
}): Edit {
  const at = method.endIndex;
  return { start: at, end: at, text: `\n\n${indentOf(text, method.startIndex)}${helper}` };
}
