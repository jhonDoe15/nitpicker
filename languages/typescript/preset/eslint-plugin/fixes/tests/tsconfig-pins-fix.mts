import type { TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../rules/typed/node-views.mts';
import { addingProperty, isPlainObject, keyName } from '../support/objects.mts';
import type { FixPlan } from '../support/ranges.mts';

export function pinsFix(
  sourceCode: SourceCode,
  compilerOptions: TSESTree.Property,
): FixPlan | undefined {
  const object = compilerOptions.value;
  if (!isPlainObject(object)) {
    return undefined;
  }
  const keys = new Set(object.properties.map(keyName));
  const missing = [
    ...(keys.has('types') ? [] : ['types: []']),
    ...(keys.has('lib') || keys.has('noLib') ? [] : ["lib: ['ES2022']"]),
  ];
  return missing.length === 0 ? undefined : addingProperty(sourceCode, object, missing.join(', '));
}
