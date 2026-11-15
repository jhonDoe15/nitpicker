import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, type SourceCode } from '../../rules/typed/node-views.mts';
import { hasCommentIn, type ReportFix } from '../support/ranges.mts';
import { isPlainObject, keyName, removingProperty } from '../support/objects.mts';

type Part =
  | { readonly text: string; readonly expression?: undefined }
  | { readonly text?: undefined; readonly expression: TSESTree.Expression };
type Word = Part[];
type CalleeRename = { readonly range: TSESTree.Range; readonly text: string };

const FILE_FORMS = new Map([
  ['exec', 'execFile'],
  ['execSync', 'execFileSync'],
]);
const SHELL_SYNTAX = /[|&;<>()$`\\"'*?[\]{}~#!\n\r]/u;
const CHILD_PROCESS = new Set(['child_process', 'node:child_process']);

function quoted(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function templateText(text: string): string {
  return text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
}

function argumentSource(sourceCode: SourceCode, parts: readonly Part[]): string {
  const only = parts.length === 1 ? parts[0] : undefined;
  if (only?.text !== undefined) {
    return quoted(only.text);
  }
  if (only !== undefined) {
    const isLiteral =
      only.expression.type === AST_NODE_TYPES.Literal ||
      only.expression.type === AST_NODE_TYPES.TemplateLiteral;
    return isLiteral
      ? sourceCode.getText(only.expression)
      : `String(${sourceCode.getText(only.expression)})`;
  }
  const body = parts.map((part) =>
    part.text === undefined
      ? `\${${sourceCode.getText(part.expression)}}`
      : templateText(part.text),
  );
  return `\`${body.join('')}\``;
}

function pushPieces(words: Word[], text: string): void {
  for (const piece of text.split(/(\s+)/u)) {
    if (/^\s+$/u.test(piece)) {
      words.push([]);
    } else if (piece !== '') {
      words.at(-1)?.push({ text: piece });
    }
  }
}

function wordsOf(template: TSESTree.TemplateLiteral): Word[] {
  const words: Word[] = [[]];
  for (const [index, quasi] of template.quasis.entries()) {
    pushPieces(words, quasi.value.cooked ?? '');
    const expression = template.expressions[index];
    if (expression !== undefined) {
      words.at(-1)?.push({ expression });
    }
  }
  return words.filter((word) => word.length > 0);
}

function isCleanText(words: readonly Word[]): boolean {
  const [program = []] = words;
  const isStatic = program.every((part) => part.text !== undefined && !part.text.includes('='));
  return (
    isStatic &&
    words.every((word) =>
      word.every((part) => part.text === undefined || !SHELL_SYNTAX.test(part.text)),
    )
  );
}

function localName(sourceCode: SourceCode, imported: string): string | undefined {
  const specifiers = sourceCode.ast.body.flatMap((node) =>
    node.type === AST_NODE_TYPES.ImportDeclaration && CHILD_PROCESS.has(node.source.value)
      ? node.specifiers
      : [],
  );
  return specifiers.find(
    (specifier) =>
      specifier.type === AST_NODE_TYPES.ImportSpecifier && nameOf(specifier.imported) === imported,
  )?.local.name;
}

function renamedCallee(
  sourceCode: SourceCode,
  callee: TSESTree.Node,
  { name, target }: { readonly name: string; readonly target: string },
): CalleeRename | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    const local = localName(sourceCode, target);
    const isImported = localName(sourceCode, name) === callee.name;
    return local === undefined || !isImported ? undefined : { range: callee.range, text: local };
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? { range: callee.property.range, text: target }
    : undefined;
}

function acceptsRest(call: TSESTree.CallExpression): boolean {
  return call.arguments.slice(1).every((argument) => {
    const isFunction = argument.type.includes('Function');
    const isOptions =
      isPlainObject(argument) && !argument.properties.some((p) => keyName(p) === 'shell');
    return isFunction || isOptions;
  });
}

export function execFileFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  name: string,
): ReportFix | undefined {
  const template = call.arguments[0];
  const target = FILE_FORMS.get(name);
  if (
    template?.type !== AST_NODE_TYPES.TemplateLiteral ||
    target === undefined ||
    !acceptsRest(call)
  ) {
    return undefined;
  }
  const words = wordsOf(template);
  const callee = renamedCallee(sourceCode, call.callee, { name, target });
  if (words.length === 0 || !isCleanText(words) || callee === undefined) {
    return undefined;
  }
  if (hasCommentIn(sourceCode, call.range)) {
    return undefined;
  }
  const [program = [], ...rest] = words;
  const list = rest.map((word) => argumentSource(sourceCode, word)).join(', ');
  const replacement = `${argumentSource(sourceCode, program)}, [${list}]`;
  return (fixer) => [
    fixer.replaceTextRange(callee.range, callee.text),
    fixer.replaceTextRange(template.range, replacement),
  ];
}

function literalWords(command: TSESTree.Node | undefined): string[] | undefined {
  const text = command?.type === AST_NODE_TYPES.Literal ? command.value : undefined;
  if (typeof text !== 'string' || SHELL_SYNTAX.test(text) || text.trim() === '') {
    return undefined;
  }
  return text.trim().split(/\s+/u);
}

export function dropShellFix(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): ReportFix | undefined {
  const [command, second, third] = call.arguments;
  const words = literalWords(command);
  const hasList = second?.type === AST_NODE_TYPES.ArrayExpression;
  const options = hasList ? third : second;
  const shell =
    options?.type === AST_NODE_TYPES.ObjectExpression
      ? options.properties.find(
          (property): property is TSESTree.Property =>
            property.type === AST_NODE_TYPES.Property && keyName(property) === 'shell',
        )
      : undefined;
  const listIsPlain =
    !hasList ||
    second.elements.every(
      (element) => element !== null && element.type !== AST_NODE_TYPES.SpreadElement,
    );
  const program = words?.[0];
  const keepsProgram =
    words !== undefined &&
    program !== undefined &&
    !program.includes('=') &&
    (!hasList || words.length === 1);
  const isShellTrue = shell?.value.type === AST_NODE_TYPES.Literal && shell.value.value === true;
  const removal = isShellTrue ? removingProperty(sourceCode, shell) : undefined;
  if (
    removal === undefined ||
    !isPlainObject(options) ||
    !listIsPlain ||
    !keepsProgram ||
    command === undefined
  ) {
    return undefined;
  }
  if (hasList || words.length === 1) {
    return removal;
  }
  const list = words.slice(1).map(quoted).join(', ');
  return (fixer) => [
    fixer.replaceTextRange(command.range, `${quoted(program)}, [${list}]`),
    ...[removal(fixer)].flat(),
  ];
}
