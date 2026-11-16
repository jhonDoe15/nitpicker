import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mts';
import type { FixPlan } from '../support/ranges.mts';

const HERMETIC_VALUES = [
  ['GIT_CONFIG_GLOBAL', "'/dev/null'"],
  ['GIT_CONFIG_NOSYSTEM', "'1'"],
] as const;

function assignments(keys: ReadonlySet<string | undefined>): string[] {
  return HERMETIC_VALUES.filter(([key]) => !keys.has(key)).map(
    ([key, value]) => `${key}: ${value}`,
  );
}

export function hermeticFix(
  sourceCode: SourceCode,
  options: TSESTree.Node | undefined,
): FixPlan | undefined {
  if (!isPlainObject(options)) {
    return undefined;
  }
  const environment = options.properties.find(
    (property): property is TSESTree.Property =>
      property.type === AST_NODE_TYPES.Property && keyName(property) === 'env',
  );
  if (environment === undefined) {
    const text = ['...process.env', ...assignments(new Set())].join(', ');
    return addingProperty(sourceCode, options, `env: { ${text} }`);
  }
  const value = environment.value;
  if (!isPlainObject(value, { allowSpread: true })) {
    return undefined;
  }
  const keys = new Set(value.properties.map(keyName));
  const missing = assignments(keys);
  return missing.length === 0 ? undefined : addingProperty(sourceCode, value, missing.join(', '));
}
