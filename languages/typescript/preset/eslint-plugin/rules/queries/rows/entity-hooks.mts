import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { typeServices } from '../../security/security-values.mts';
import { cachedValue } from '../../../../../../../shared/values/caching/cached-value.mts';

const HOOK_NAME =
  /^(?:Before|After)(?:Insert|Update|Remove|SoftRemove|Recover|Create|Delete|Destroy|Save|Upsert|Bulk\w*)$/u;
const VERSION_NAMES = new Set(['VersionColumn', 'Version', 'VersionAttribute']);
const SUBSCRIBERS = new Set(['EventSubscriber', 'EntitySubscriberInterface']);
const HOOK_METHODS = /^(?:addHook|before\w+|after\w+)$/u;
const SUBSCRIBED = new Set(['listenTo', 'getSubscribedEntities']);
const HINT =
  /EventSubscriber|EntitySubscriberInterface|addHook|\.(?:before|after)[A-Z]|hooks\s*:|version\s*:/u;
const indexes = new WeakMap();
const MAX_BASES = 3;

function decoratorName(decorator) {
  const { expression } = decorator;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(callee) ? callee.text : undefined;
}

const CASCADE_OPTIONS = new Set(['cascade', 'orphanRemoval', 'orphanedRowAction']);

function isOptionHooked(property) {
  if (!ts.isPropertyAssignment(property)) {
    return false;
  }
  const name = property.name.getText();
  const value = property.initializer.kind;
  return (
    (name === 'version' && value === ts.SyntaxKind.TrueKeyword) ||
    (CASCADE_OPTIONS.has(name) && value !== ts.SyntaxKind.FalseKeyword)
  );
}

function declaresVersion(decorator) {
  const { expression } = decorator;
  const options = ts.isCallExpression(expression) ? expression.arguments : [];
  return options.some(
    (argument) =>
      ts.isObjectLiteralExpression(argument) && argument.properties.some(isOptionHooked),
  );
}

function isHookDecorator(decorator) {
  const name = decoratorName(decorator);
  return (
    name !== undefined &&
    (HOOK_NAME.test(name) || VERSION_NAMES.has(name) || declaresVersion(decorator))
  );
}

function memberHooked(member) {
  const decorators = ts.canHaveDecorators(member) ? (ts.getDecorators(member) ?? []) : [];
  return decorators.some(isHookDecorator);
}

function returnedNames(method) {
  const names = [];
  function visit(node) {
    if (ts.isReturnStatement(node) && node.expression !== undefined) {
      const value = node.expression;
      const items = ts.isArrayLiteralExpression(value) ? [...value.elements] : [value];
      names.push(...items.filter(ts.isIdentifier).map((item) => item.text));
    }
    if (!ts.isFunctionLike(node) || node === method) {
      ts.forEachChild(node, visit);
    }
  }
  visit(method);
  return names;
}

function isSubscriber(node) {
  const decorated = (ts.getDecorators(node) ?? []).some((each) =>
    SUBSCRIBERS.has(decoratorName(each)),
  );
  const implemented = (node.heritageClauses ?? []).some((clause) =>
    clause.types.some((type) => SUBSCRIBERS.has(type.expression.getText())),
  );
  return decorated || implemented;
}

function noteSubscriber(node, index) {
  const lookup = node.members.find(
    (member) => ts.isMethodDeclaration(member) && SUBSCRIBED.has(member.name.getText()),
  );
  const names = lookup === undefined ? [] : returnedNames(lookup);
  if (names.length === 0) {
    index.global = true;
  }
  for (const name of names) {
    index.names.add(name);
  }
}

function noteCall(node, index) {
  const callee = node.expression;
  const isHookCall =
    ts.isPropertyAccessExpression(callee) &&
    HOOK_METHODS.test(callee.name.text) &&
    ts.isIdentifier(callee.expression);
  const init = ts.isPropertyAccessExpression(callee) && callee.name.text === 'init';
  const configured =
    init &&
    node.arguments.some(
      (argument) =>
        ts.isObjectLiteralExpression(argument) && /hooks|version/u.test(argument.getText()),
    );
  if ((isHookCall || configured) && ts.isIdentifier(callee.expression)) {
    index.names.add(callee.expression.text);
  }
}

function scan(sourceFile, index) {
  function visit(node) {
    if (ts.isClassDeclaration(node) && isSubscriber(node)) {
      noteSubscriber(node, index);
    }
    if (ts.isCallExpression(node)) {
      noteCall(node, index);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function programIndex(program) {
  return cachedValue(indexes, program, () => {
    const index = { names: new Set(), global: false };
    for (const file of program.getSourceFiles()) {
      if (
        !file.isDeclarationFile &&
        !file.fileName.includes('/node_modules/') &&
        HINT.test(file.text)
      ) {
        scan(file, index);
      }
    }
    return index;
  });
}

function baseDeclaration(checker, declaration) {
  const clause = declaration.heritageClauses?.find(
    (each) => each.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const base = clause?.types[0];
  const symbol = base === undefined ? undefined : checker.getTypeAtLocation(base).getSymbol();
  return symbol?.declarations?.find(ts.isClassDeclaration);
}

function classHooked(checker, declaration) {
  const chain = [declaration];
  for (const current of chain.slice(0, MAX_BASES)) {
    const base = baseDeclaration(checker, current);
    if (base !== undefined) {
      chain.push(base);
    }
  }
  return chain.some((current) => current.members.some(memberHooked));
}

const LOOSE_TYPES = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

function rowClass(services, awaited) {
  const checker = services.program.getTypeChecker();
  const type = services.getTypeAtLocation(awaited);
  const element = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  const loose = element === undefined || (element.flags & LOOSE_TYPES) !== 0;
  const declaration = loose
    ? undefined
    : element.getSymbol()?.declarations?.find(ts.isClassDeclaration);
  return { checker, declaration, loose };
}

export function hookStatus(context, awaited) {
  const services = typeServices(context);
  if (services === undefined) {
    return 'unknown';
  }
  const { checker, declaration, loose } = rowClass(services, awaited);
  if (loose) {
    return 'unknown';
  }
  if (declaration === undefined) {
    return 'plain';
  }
  const index = programIndex(services.program);
  const hooked =
    index.global || index.names.has(declaration.name?.text) || classHooked(checker, declaration);
  return hooked ? 'hooked' : 'clean';
}
