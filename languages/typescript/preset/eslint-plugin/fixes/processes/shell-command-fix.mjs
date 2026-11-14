import { hasCommentIn } from '../support/ranges.mjs';
import { isPlainObject, keyName, removingProperty } from '../support/objects.mjs';

const FILE_FORMS = new Map([
  ['exec', 'execFile'],
  ['execSync', 'execFileSync'],
]);
const SHELL_SYNTAX = /[|&;<>()$`\\"'*?[\]{}~#!\n\r]/u;
const CHILD_PROCESS = new Set(['child_process', 'node:child_process']);

function quoted(text) {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function templateText(text) {
  return text.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
}

function argumentSource(sourceCode, parts) {
  const [only] = parts;
  if (parts.length === 1 && only.text !== undefined) {
    return quoted(only.text);
  }
  if (parts.length === 1 && ['Literal', 'TemplateLiteral'].includes(only.expression.type)) {
    return sourceCode.getText(only.expression);
  }
  if (parts.length === 1) {
    return `String(${sourceCode.getText(only.expression)})`;
  }
  const body = parts.map((part) =>
    part.text === undefined
      ? `\${${sourceCode.getText(part.expression)}}`
      : templateText(part.text),
  );
  return `\`${body.join('')}\``;
}

function pushPieces(words, text) {
  for (const piece of text.split(/(\s+)/u)) {
    if (/^\s+$/u.test(piece)) {
      words.push([]);
    } else if (piece !== '') {
      words.at(-1).push({ text: piece });
    }
  }
}

function wordsOf(template) {
  const words = [[]];
  for (const [index, quasi] of template.quasis.entries()) {
    pushPieces(words, quasi.value.cooked ?? '');
    const expression = template.expressions[index];
    if (expression !== undefined) {
      words.at(-1).push({ expression });
    }
  }
  return words.filter((word) => word.length > 0);
}

function isCleanText(words) {
  const [program] = words;
  const isStatic = program.every((part) => part.text !== undefined && !part.text.includes('='));
  return (
    isStatic &&
    words.every((word) =>
      word.every((part) => part.text === undefined || !SHELL_SYNTAX.test(part.text)),
    )
  );
}

function localName(sourceCode, imported) {
  const specifiers = sourceCode.ast.body
    .filter((node) => node.type === 'ImportDeclaration' && CHILD_PROCESS.has(node.source.value))
    .flatMap((node) => node.specifiers);
  return specifiers.find(
    (specifier) => specifier.type === 'ImportSpecifier' && specifier.imported.name === imported,
  )?.local.name;
}

function renamedCallee(sourceCode, callee, { name, target }) {
  if (callee.type === 'Identifier') {
    const local = localName(sourceCode, target);
    const isImported = localName(sourceCode, name) === callee.name;
    return local === undefined || !isImported ? undefined : { range: callee.range, text: local };
  }
  return callee.type === 'MemberExpression' && !callee.computed
    ? { range: callee.property.range, text: target }
    : undefined;
}

function acceptsRest(call) {
  return call.arguments.slice(1).every((argument) => {
    const isFunction = /Function/u.test(argument.type);
    const isOptions =
      isPlainObject(argument) && !argument.properties.some((p) => keyName(p) === 'shell');
    return isFunction || isOptions;
  });
}

export function execFileFix(sourceCode, call, name) {
  const template = call.arguments[0];
  const target = FILE_FORMS.get(name);
  if (template?.type !== 'TemplateLiteral' || target === undefined || !acceptsRest(call)) {
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
  const [program, ...rest] = words;
  const list = rest.map((word) => argumentSource(sourceCode, word)).join(', ');
  const replacement = `${argumentSource(sourceCode, program)}, [${list}]`;
  return (fixer) => [
    fixer.replaceTextRange(callee.range, callee.text),
    fixer.replaceTextRange(template.range, replacement),
  ];
}

function literalWords(command) {
  const text = command?.type === 'Literal' ? command.value : undefined;
  if (typeof text !== 'string' || SHELL_SYNTAX.test(text) || text.trim() === '') {
    return undefined;
  }
  return text.trim().split(/\s+/u);
}

export function dropShellFix(sourceCode, call) {
  const [command, second, third] = call.arguments;
  const words = literalWords(command);
  const hasList = second?.type === 'ArrayExpression';
  const options = hasList ? third : second;
  const shell = options?.properties?.find((property) => keyName(property) === 'shell');
  const listIsPlain =
    !hasList ||
    second.elements.every((element) => element !== null && element.type !== 'SpreadElement');
  const keepsProgram =
    words !== undefined && !words[0].includes('=') && (!hasList || words.length === 1);
  const removal = shell?.value.value === true ? removingProperty(sourceCode, shell) : undefined;
  if (removal === undefined || !isPlainObject(options) || !listIsPlain || !keepsProgram) {
    return undefined;
  }
  if (hasList || words.length === 1) {
    return removal;
  }
  const list = words.slice(1).map(quoted).join(', ');
  return (fixer) => [
    fixer.replaceTextRange(command.range, `${quoted(words[0])}, [${list}]`),
    ...[removal(fixer)].flat(),
  ];
}
