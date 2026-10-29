import { ancestorsOf } from '../analysis/ancestry.mjs';
import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { bindingsOf, loadedModule } from '../security/imported-names.mjs';
import { memberName, staticKey, unwrapped } from '../security/security-values.mjs';

const MAX_DEPTH = 6;

export function skipped(node) {
  const chain = [unwrapped(node)];
  for (const current of chain) {
    if (current?.type === 'AwaitExpression') {
      chain.push(unwrapped(current.argument));
    }
  }
  return chain.at(-1);
}

export function descendants(root) {
  return depthFirst(root, objectChildren);
}

function declaratorsOf(program) {
  return [...descendants(program)].filter((node) => node.type === 'VariableDeclarator');
}

function addLoaded(bindings, declarator) {
  const { id } = declarator;
  if (id.type === 'Identifier') {
    bindings.namespaces.add(id.name);
    return;
  }
  for (const property of id.type === 'ObjectPattern' ? id.properties : []) {
    const key = property.type === 'Property' ? staticKey(property) : undefined;
    if (key === 'default' && property.value.type === 'Identifier') {
      bindings.namespaces.add(property.value.name);
    } else if (key !== undefined && property.value.type === 'Identifier') {
      bindings.named.set(property.value.name, key);
    }
  }
}

function moduleBindingsOf(program, wanted) {
  const declarators = declaratorsOf(program).map((node) => ({
    node,
    source: loadedModule(node.init),
  }));
  const imports = program.body
    .filter((statement) => statement.type === 'ImportDeclaration')
    .map((statement) => statement.source.value);
  const sources = new Set(
    [...imports, ...declarators.map(({ source }) => source)].filter(
      (s) => s !== undefined && wanted(s),
    ),
  );
  return [...sources].map((source) => {
    const bindings = bindingsOf(program, new Set([source]));
    for (const declarator of declarators.filter((entry) => entry.source === source)) {
      addLoaded(bindings, declarator.node);
    }
    return { source, bindings };
  });
}

function importedRef(entry, name) {
  const { source, bindings } = entry;
  const imported =
    bindings.named.get(name) ?? (bindings.namespaces.has(name) ? 'default' : undefined);
  return imported === undefined ? undefined : { source, imported, instance: false };
}

function matchesMaker(spec, name) {
  return spec.makers.has(name) || spec.makerPattern?.test(name) === true;
}

function matchesType(spec, name) {
  return spec.makers.has(name) || spec.types.has(name) || spec.typePattern?.test(name) === true;
}

function typeName(annotation) {
  const reference = annotation?.typeAnnotation?.typeAnnotation ?? annotation?.typeAnnotation;
  const name = reference?.type === 'TSTypeReference' ? reference.typeName : undefined;
  if (name?.type === 'TSQualifiedName') {
    return { owner: name.left.name, name: name.right.name };
  }
  return name?.type === 'Identifier' ? { name: name.name } : undefined;
}

function moduleRef(env, scopeNode, name) {
  const variable = findVariable(env.context, scopeNode, name);
  const local = variable?.defs.some((definition) => definition.type === 'Parameter');
  const found = local ? [] : env.entries.map((entry) => importedRef(entry, name));
  return found.find((ref) => ref !== undefined);
}

function instance(env, ref, creation) {
  return { source: ref.source, spec: env.clientSpec(ref.source), instance: true, creation };
}

function typeOrigin(env, annotation) {
  const type = typeName(annotation);
  const ref = type === undefined ? undefined : env.typeImports.get(type.owner ?? type.name);
  const spec = ref === undefined ? undefined : env.clientSpec(ref.source);
  const wantedName = type?.owner === undefined ? ref?.imported : type.name;
  return spec !== undefined && matchesType(spec, wantedName)
    ? instance(env, ref, undefined)
    : undefined;
}

function parameterOrigin(env, name) {
  const parameter = name.type === 'Identifier' ? name : name.left;
  return typeOrigin(env, parameter?.typeAnnotation);
}

function madeBy(env, site, base) {
  const { target, call } = site;
  if (base?.instance) {
    return base.spec.derivers?.has(memberName(target)) === true ? base : undefined;
  }
  const isIdentifier = target.type === 'Identifier';
  const ref = isIdentifier ? moduleRef(env, target, target.name) : base;
  const name = isIdentifier ? ref?.imported : memberName(target);
  const spec = ref === undefined ? undefined : env.clientSpec(ref.source);
  const isDefault = ref?.imported === 'default' && isIdentifier;
  const makes =
    spec !== undefined && (matchesMaker(spec, name) || (isDefault && spec.makers.has('default')));
  return makes ? instance(env, ref, call) : undefined;
}

function memberOf(base, member) {
  if (base?.instance === false) {
    return { ...base, member: memberName(member) };
  }
  return base?.spec.deep === true ? base : undefined;
}

function sameValue(value) {
  return value;
}

function firstValue(values) {
  return values[0];
}

function goalFor(parent, node, value) {
  return { node, depth: parent.depth + 1, value, children: [], combine: firstValue };
}

function follow(pending, goal, link) {
  const next = goalFor(goal, link.node, undefined);
  pending.push(next);
  goal.children = [next];
  goal.combine = ([value]) => link.combine(value);
}

function expandIdentifier(env, pending, goal) {
  const identifier = skipped(goal.node);
  const ref = moduleRef(env, identifier, identifier.name);
  if (ref !== undefined) {
    goal.value = { ...ref, spec: env.clientSpec(ref.source) };
    return;
  }
  const variable = findVariable(env.context, identifier, identifier.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (definition?.type === 'Parameter') {
    goal.value = parameterOrigin(env, definition.name);
  } else if (definition?.type === 'Variable' && definition.node.id.type === 'Identifier') {
    goal.value = typeOrigin(env, definition.node.id.typeAnnotation);
    if (goal.value === undefined) {
      follow(pending, goal, { node: definition.node.init, combine: sameValue });
    }
  }
}

function fieldCandidate(env, node, key) {
  if (node.type === 'PropertyDefinition' && !node.computed && node.key.name === key) {
    return { value: typeOrigin(env, node.typeAnnotation), next: node.value };
  }
  if (node.type === 'TSParameterProperty' && node.parameter.name === key) {
    return { value: parameterOrigin(env, node.parameter), next: undefined };
  }
  const assigns =
    node.type === 'AssignmentExpression' &&
    node.left.type === 'MemberExpression' &&
    node.left.object.type === 'ThisExpression' &&
    memberName(node.left) === key;
  return assigns ? { value: undefined, next: node.right } : undefined;
}

function expandField(env, pending, goal) {
  const member = skipped(goal.node);
  const key = memberName(member);
  const owner = classOf(member);
  if (owner === undefined || key === undefined) {
    return;
  }
  const candidates = [...descendants(owner.body)]
    .map((node) => fieldCandidate(env, node, key))
    .filter((candidate) => candidate !== undefined)
    .map(({ value, next }) => goalFor(goal, next, value));
  pending.push(...candidates);
  goal.children = candidates;
  goal.combine = (values) => values.find((value) => value !== undefined);
}

function expandMember(env, pending, goal) {
  const member = skipped(goal.node);
  if (member.object.type === 'ThisExpression') {
    expandField(env, pending, goal);
  } else {
    follow(pending, goal, { node: member.object, combine: (base) => memberOf(base, member) });
  }
}

function expandCall(env, pending, goal) {
  const call = skipped(goal.node);
  const target = skipped(call.callee);
  const site = { target, call };
  if (target.type === 'MemberExpression') {
    follow(pending, goal, { node: target.object, combine: (base) => madeBy(env, site, base) });
  } else {
    goal.value = madeBy(env, site, undefined);
  }
}

function expand(env, pending, goal) {
  const target = skipped(goal.node);
  if (goal.value !== undefined || target === undefined || target === null) {
    return;
  }
  if (goal.depth > MAX_DEPTH) {
    return;
  }
  if (target.type === 'Identifier') {
    expandIdentifier(env, pending, goal);
  } else if (target.type === 'CallExpression' || target.type === 'NewExpression') {
    expandCall(env, pending, goal);
  } else if (target.type === 'MemberExpression') {
    expandMember(env, pending, goal);
  }
}

function resolveOrigin(env, node) {
  const goals = [goalFor({ depth: -1 }, node, undefined)];
  for (const goal of goals) {
    expand(env, goals, goal);
  }
  for (const goal of goals.toReversed()) {
    if (goal.children.length > 0) {
      goal.value = goal.combine(goal.children.map((child) => child.value));
    }
  }
  return goals[0].value;
}

export function createOrigins(context, clientSpec) {
  const env = {
    context,
    clientSpec,
    entries: moduleBindingsOf(context.sourceCode.ast, (source) => clientSpec(source) !== undefined),
    typeImports: typeImportsOf(context.sourceCode.ast, clientSpec),
  };
  return {
    originOf: (node) => resolveOrigin(env, node),
    moduleRef: (scopeNode, name) => moduleRef(env, scopeNode, name),
  };
}

function classOf(node) {
  return ancestorsOf(node).find((ancestor) => ancestor.type === 'ClassBody')?.parent;
}

function typeImportsOf(program, clientSpec) {
  const found = new Map();
  for (const statement of program.body) {
    const known = statement.type === 'ImportDeclaration' && clientSpec(statement.source.value);
    for (const specifier of known ? statement.specifiers : []) {
      const imported = specifier.type === 'ImportSpecifier' ? specifier.imported.name : 'default';
      found.set(specifier.local.name, {
        source: statement.source.value,
        imported,
        instance: false,
      });
    }
  }
  return found;
}
