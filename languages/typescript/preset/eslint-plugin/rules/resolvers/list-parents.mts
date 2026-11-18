import type TypeScript from 'typescript';
import { typeServices, type Context } from '../security/security-values.mts';
import { ts } from '../typed/typescript-views.mts';
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
const programNames = new WeakMap<TypeScript.Program, Set<string>>();
const fileNames = new WeakMap<TypeScript.SourceFile, Set<string>>();
const parsedFiles = new WeakMap<object, TypeScript.SourceFile>();

function isSchemaDecoratorCall(arrow: TypeScript.ArrowFunction): boolean {
  const call = arrow.parent;
  return (
    ts.isCallExpression(call) &&
    call.arguments.includes(arrow) &&
    ts.isIdentifier(call.expression) &&
    SCHEMA_DECORATORS.has(call.expression.text) &&
    ts.isDecorator(call.parent)
  );
}

function listElement(node: TypeScript.ArrayLiteralExpression): string[] {
  const [only] = node.elements;
  return node.elements.length === 1 && only !== undefined && ts.isIdentifier(only)
    ? [only.text]
    : [];
}

function decoratedListNames(node: TypeScript.Node): string[] {
  if (!(ts.isArrowFunction(node) && isSchemaDecoratorCall(node))) {
    return [];
  }
  const body = ts.isParenthesizedExpression(node.body) ? node.body.expression : node.body;
  return ts.isArrayLiteralExpression(body) ? listElement(body) : [];
}

function literalText(node: TypeScript.Node): string | undefined {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return ts.isTemplateExpression(node)
    ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ')
    : undefined;
}

function sdlListNames(node: TypeScript.Node): string[] {
  const text = literalText(node);
  return text === undefined
    ? []
    : [...text.matchAll(SDL_LIST)].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
}

function collect(sourceFile: TypeScript.SourceFile): Set<string> {
  const names = new Set<string>();
  function visit(node: TypeScript.Node): void {
    for (const name of [...decoratedListNames(node), ...sdlListNames(node)]) {
      names.add(name);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function isCandidate(sourceFile: TypeScript.SourceFile): boolean {
  return (
    !sourceFile.isDeclarationFile &&
    !sourceFile.fileName.includes('/node_modules/') &&
    LIST_HINT.test(sourceFile.text)
  );
}

function namesOfFile(sourceFile: TypeScript.SourceFile): Set<string> {
  return cachedValue(fileNames, sourceFile, collect);
}

function namesOfProgram(program: TypeScript.Program): Set<string> {
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

function parsedCurrentFile(context: Context): TypeScript.SourceFile {
  const { ast, text } = context.sourceCode;
  return cachedValue(parsedFiles, ast, () =>
    ts.createSourceFile(context.filename, text, ts.ScriptTarget.Latest, true),
  );
}

export function isListParent(name: string, context: Context): boolean {
  const services = typeServices(context);
  const names =
    services === undefined
      ? namesOfFile(parsedCurrentFile(context))
      : namesOfProgram(services.program);
  return names.has(name);
}
