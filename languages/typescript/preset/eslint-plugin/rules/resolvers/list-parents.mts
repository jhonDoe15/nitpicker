import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { typeServices } from '../security/security-values.mts';
import { cachedValue } from '../../../../../../shared/values/caching/cached-value.mts';

const SCHEMA_DECORATORS = new Set([
  'Query',
  'Mutation',
  'Subscription',
  'Field',
  'ResolveField',
  'FieldResolver',
  'ResolveProperty',
]);
const LIST_HINT = /(?:=>|:)\s*\[\s*[A-Za-z_]/u;
const SDL_LIST = /:\s*\[\s*([A-Za-z_]\w*)\s*(?:!\s*)?\]/gu;
const programNames = new WeakMap();
const fileNames = new WeakMap();
const parsedFiles = new WeakMap();

function isSchemaDecoratorCall(arrow) {
  const call = arrow.parent;
  return (
    ts.isCallExpression(call) &&
    call.arguments.includes(arrow) &&
    ts.isIdentifier(call.expression) &&
    SCHEMA_DECORATORS.has(call.expression.text) &&
    ts.isDecorator(call.parent)
  );
}

function listElement(node) {
  const [only] = node.elements;
  return node.elements.length === 1 && only !== undefined && ts.isIdentifier(only)
    ? [only.text]
    : [];
}

function decoratedListNames(node) {
  if (!(ts.isArrowFunction(node) && isSchemaDecoratorCall(node))) {
    return [];
  }
  const body = ts.isParenthesizedExpression(node.body) ? node.body.expression : node.body;
  return ts.isArrayLiteralExpression(body) ? listElement(body) : [];
}

function literalText(node) {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return ts.isTemplateExpression(node)
    ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ')
    : undefined;
}

function sdlListNames(node) {
  const text = literalText(node);
  return text === undefined ? [] : [...text.matchAll(SDL_LIST)].map((match) => match[1]);
}

function collect(sourceFile) {
  const names = new Set();
  function visit(node) {
    for (const name of [...decoratedListNames(node), ...sdlListNames(node)]) {
      names.add(name);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function isCandidate(sourceFile) {
  return (
    !sourceFile.isDeclarationFile &&
    !sourceFile.fileName.includes('/node_modules/') &&
    LIST_HINT.test(sourceFile.text)
  );
}

function namesOfFile(sourceFile) {
  return cachedValue(fileNames, sourceFile, collect);
}

function namesOfProgram(program) {
  return cachedValue(
    programNames,
    program,
    () =>
      new Set(
        program
          .getSourceFiles()
          .filter(isCandidate)
          .flatMap((file) => [...namesOfFile(file)]),
      ),
  );
}

function parsedCurrentFile(context) {
  const { ast, text } = context.sourceCode;
  return cachedValue(parsedFiles, ast, () =>
    ts.createSourceFile(context.filename, text, ts.ScriptTarget.Latest, true),
  );
}

export function isListParent(name, context) {
  const services = typeServices(context);
  const names =
    services === undefined
      ? namesOfFile(parsedCurrentFile(context))
      : namesOfProgram(services.program);
  return names.has(name);
}
