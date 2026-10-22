import { typeServices } from '../security/security-values.mjs';
import { estreeCallView } from './io/call-views.mjs';
import { directEffects, namedKind } from './io/call-tags.mjs';
import { libraryKind } from './io/packages.mjs';
import { typedCallEffects } from './io/summaries.mjs';

const KINDS = ['database', 'remote', 'message'];

function requiredModule(init) {
  const isRequire =
    init?.type === 'CallExpression' &&
    init.callee.type === 'Identifier' &&
    init.callee.name === 'require' &&
    init.arguments[0]?.type === 'Literal';
  return isRequire ? String(init.arguments[0].value) : undefined;
}

function declaredNames(pattern) {
  if (pattern.type !== 'ObjectPattern') {
    return [pattern.name];
  }
  return pattern.properties.flatMap((property) =>
    property.value?.type === 'Identifier' ? [property.value.name] : [],
  );
}

function statementModules(statement) {
  if (statement.type === 'ImportDeclaration' && statement.importKind !== 'type') {
    return statement.specifiers
      .filter((specifier) => specifier.importKind !== 'type')
      .map((specifier) => [specifier.local.name, statement.source.value]);
  }
  const declarators = statement.type === 'VariableDeclaration' ? statement.declarations : [];
  return declarators.flatMap((declarator) => {
    const module = requiredModule(declarator.init);
    return module === undefined ? [] : declaredNames(declarator.id).map((name) => [name, module]);
  });
}

function untypedEffects(call, sourceCode) {
  const view = estreeCallView(call);
  const modules = new Map(sourceCode.ast.body.flatMap(statementModules));
  const pkg = view.root === undefined ? undefined : modules.get(view.root.name);
  const kind = pkg === undefined ? undefined : libraryKind(pkg, view, () => true);
  return directEffects(kind ?? namedKind(view), pkg, view);
}

export function callEffects(call, context) {
  const services = typeServices(context);
  return services === undefined
    ? untypedEffects(call, context.sourceCode)
    : typedCallEffects(services.esTreeNodeToTSNodeMap.get(call), services.program);
}

export function ioEffect(call, context) {
  const effects = callEffects(call, context);
  const kind = KINDS.find((each) => effects.has(each));
  return kind === undefined ? undefined : { kind, path: effects.get(kind) };
}

export function ioKind(call, context) {
  return ioEffect(call, context)?.kind;
}

export function describePath(path) {
  return path.map((label) => `\`${label}\``).join(', which calls ');
}

export function chainOuterCall(call) {
  const member = call.parent;
  const outer = member?.parent;
  const isLink =
    member?.type === 'MemberExpression' &&
    member.object === call &&
    outer?.type === 'CallExpression' &&
    outer.callee === member;
  return isLink ? outer : undefined;
}
