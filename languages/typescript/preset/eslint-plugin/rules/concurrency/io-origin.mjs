import { ancestorsOf } from '../analysis/ancestry.mjs';
import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { findVariable } from '../analysis/constant-resolution.mjs';
import { bindingsOf, loadedModule } from '../security/imported-names.mjs';
import { memberName, staticKey, unwrapped } from '../security/security-values.mjs';

const MAX_DEPTH = 6;

export function skipped(node) {
  const target = unwrapped(node);
  return target?.type === 'AwaitExpression' ? skipped(target.argument) : target;
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

export function createOrigins(context, clientSpec) {
  const entries = moduleBindingsOf(
    context.sourceCode.ast,
    (source) => clientSpec(source) !== undefined,
  );

  function moduleRef(scopeNode, name) {
    const variable = findVariable(context, scopeNode, name);
    const local = variable?.defs.some((definition) => definition.type === 'Parameter');
    const found = local ? [] : entries.map((entry) => importedRef(entry, name));
    return found.find((ref) => ref !== undefined);
  }

  const typeImports = typeImportsOf(context.sourceCode.ast, clientSpec);

  function typeRef(name) {
    return typeImports.get(name);
  }

  function instance(ref, creation) {
    return { source: ref.source, spec: clientSpec(ref.source), instance: true, creation };
  }

  function typeOrigin(annotation) {
    const type = typeName(annotation);
    const ref = type === undefined ? undefined : typeRef(type.owner ?? type.name);
    const spec = ref === undefined ? undefined : clientSpec(ref.source);
    const wantedName = type?.owner === undefined ? ref?.imported : type.name;
    return spec !== undefined && matchesType(spec, wantedName)
      ? instance(ref, undefined)
      : undefined;
  }

  function variableOrigin(identifier, depth) {
    const variable = findVariable(context, identifier, identifier.name);
    const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
    if (definition?.type === 'Variable' && definition.node.id.type === 'Identifier') {
      return (
        typeOrigin(definition.node.id.typeAnnotation) ?? originOf(definition.node.init, depth + 1)
      );
    }
    return definition?.type === 'Parameter' ? parameterOrigin(definition.name) : undefined;
  }

  function parameterOrigin(name) {
    const parameter = name.type === 'Identifier' ? name : name.left;
    return typeOrigin(parameter?.typeAnnotation);
  }

  function fieldOrigin(member, depth) {
    const key = memberName(member);
    const owner = classOf(member);
    if (owner === undefined || key === undefined) {
      return undefined;
    }
    for (const node of descendants(owner.body)) {
      const found = declaredField(node, key, depth);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }

  function declaredField(node, key, depth) {
    if (node.type === 'PropertyDefinition' && !node.computed && node.key.name === key) {
      return typeOrigin(node.typeAnnotation) ?? originOf(node.value, depth + 1);
    }
    if (node.type === 'TSParameterProperty' && node.parameter.name === key) {
      return parameterOrigin(node.parameter);
    }
    const assigns =
      node.type === 'AssignmentExpression' &&
      node.left.type === 'MemberExpression' &&
      node.left.object.type === 'ThisExpression' &&
      memberName(node.left) === key;
    return assigns ? originOf(node.right, depth + 1) : undefined;
  }

  function madeBy(callee, call, depth) {
    const target = skipped(callee);
    const base =
      target.type === 'MemberExpression' ? originOf(target.object, depth + 1) : undefined;
    if (base?.instance) {
      const derives = base.spec.derivers?.has(memberName(target)) === true;
      return derives ? base : undefined;
    }
    const ref = target.type === 'Identifier' ? moduleRef(target, target.name) : base;
    const name = target.type === 'Identifier' ? ref?.imported : memberName(target);
    const spec = ref === undefined ? undefined : clientSpec(ref.source);
    const isDefault = ref?.imported === 'default' && target.type === 'Identifier';
    const makes =
      spec !== undefined && (matchesMaker(spec, name) || (isDefault && spec.makers.has('default')));
    return makes ? instance(ref, call) : undefined;
  }

  function originOf(node, depth = 0) {
    const target = skipped(node);
    if (target === undefined || target === null || depth > MAX_DEPTH) {
      return undefined;
    }
    if (target.type === 'Identifier') {
      const ref = moduleRef(target, target.name);
      return ref === undefined
        ? variableOrigin(target, depth)
        : { ...ref, spec: clientSpec(ref.source) };
    }
    if (target.type === 'CallExpression' || target.type === 'NewExpression') {
      return madeBy(target.callee, target, depth);
    }
    if (target.type !== 'MemberExpression') {
      return undefined;
    }
    if (target.object.type === 'ThisExpression') {
      return fieldOrigin(target, depth);
    }
    const base = originOf(target.object, depth + 1);
    if (base?.instance === false) {
      return { ...base, member: memberName(target) };
    }
    return base?.spec.deep === true ? base : undefined;
  }

  return { originOf, typeOrigin, moduleRef };
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
