import type { TSESTree } from '@typescript-eslint/utils';
import type { Definition, LibraryBinding, SourceCode } from './typed/library-types.mts';
import type { Variable } from '../eslint-plugin/rules/caches/scope-names.mts';
import { hasDefinitionKind, hasKind, isVariableDefinition } from '../syntax/kinds/node-kinds.mts';
const LITERAL = 'Literal';
const IDENTIFIER = 'Identifier';

export function variableOf(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): Variable | undefined {
  const scopes = [sourceCode.getScope(identifier)];
  for (const scope of scopes) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      return variable;
    }
    if (scope.upper !== null) {
      scopes.push(scope.upper);
    }
  }
  return undefined;
}

function isFromPackages(source: unknown, packages: readonly string[]): boolean {
  return (
    typeof source === 'string' &&
    packages.some((name) => source === name || source.startsWith(`${name}/`))
  );
}

function requireSource(init: TSESTree.Node | undefined): unknown {
  const call = hasKind(init, 'AwaitExpression') ? init.argument : init;
  return hasKind(call, 'CallExpression') &&
    hasKind(call.callee, IDENTIFIER) &&
    call.callee.name === 'require' &&
    hasKind(call.arguments[0], LITERAL)
    ? call.arguments[0].value
    : undefined;
}

function propertyName(property: TSESTree.Property | undefined): string | undefined {
  if (property === undefined) {
    return undefined;
  }
  const { key } = property;
  if (hasKind(key, IDENTIFIER)) {
    return key.name;
  }
  return hasKind(key, LITERAL) && typeof key.value === 'string' ? key.value : undefined;
}

function destructuredProperty(
  pattern: TSESTree.ObjectPattern,
  definitionName: TSESTree.BindingName,
): TSESTree.Property | undefined {
  return pattern.properties
    .filter((property) => hasKind(property, 'Property'))
    .find(
      (property) =>
        property.value === definitionName ||
        (hasKind(property.value, 'AssignmentPattern') && property.value.left === definitionName),
    );
}

function bindingOfDefinition(definition: Definition): LibraryBinding | undefined {
  if (hasDefinitionKind(definition, 'ImportBinding')) {
    const { node, parent } = definition;
    if (hasKind(parent, 'TSImportEqualsDeclaration')) {
      const reference = parent.moduleReference;
      const expression = hasKind(reference, 'TSExternalModuleReference')
        ? reference.expression
        : undefined;
      return {
        source: hasKind(expression, LITERAL) ? expression.value : undefined,
        name: undefined,
      };
    }
    return {
      source: parent.source.value,
      name:
        hasKind(node, 'ImportSpecifier') && hasKind(node.imported, IDENTIFIER)
          ? node.imported.name
          : undefined,
    };
  }
  if (!isVariableDefinition(definition)) {
    return undefined;
  }
  const source = requireSource(definition.node.init ?? undefined);
  if (source === undefined) {
    return undefined;
  }
  const property = hasKind(definition.node.id, 'ObjectPattern')
    ? destructuredProperty(definition.node.id, definition.name)
    : undefined;
  return { source, name: propertyName(property) };
}

export function libraryBinding(
  variable: Variable | undefined,
  packages: readonly string[],
): LibraryBinding | undefined {
  return (variable?.defs ?? [])
    .map((definition) => bindingOfDefinition(definition))
    .find((binding) => binding !== undefined && isFromPackages(binding.source, packages));
}

export function initializer(variable: Variable | undefined): TSESTree.Expression | undefined {
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  return isVariableDefinition(definition) && hasKind(definition.node.id, IDENTIFIER)
    ? (definition.node.init ?? undefined)
    : undefined;
}

export function destructuring(
  variable: Variable | undefined,
): { receiver: TSESTree.Expression; method: string } | undefined {
  const definition = variable?.defs.length === 1 ? variable.defs[0] : undefined;
  if (
    !isVariableDefinition(definition) ||
    !hasKind(definition.node.id, 'ObjectPattern') ||
    definition.node.init === null ||
    requireSource(definition.node.init) !== undefined
  ) {
    return undefined;
  }
  const method = propertyName(destructuredProperty(definition.node.id, definition.name));
  return method === undefined ? undefined : { receiver: definition.node.init, method };
}

export function isUnresolved(variable: Variable | undefined): boolean {
  return (variable?.defs ?? []).every(
    (definition) =>
      hasDefinitionKind(definition, 'Parameter') || hasDefinitionKind(definition, 'ImportBinding'),
  );
}
