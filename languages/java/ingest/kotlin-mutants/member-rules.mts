import { isReturn, unmangled } from './mutant-kinds.mts';
import type { ClassFacts, PropertyFacts, RuleContext } from './typed/fact-types.mts';

type Accessors = { readonly getters: string[]; readonly setters: string[] };

const VALUE_CLASS_GENERATED = new Set([
  'box-impl',
  'unbox-impl',
  'equals-impl',
  'equals-impl0',
  'hashCode-impl',
  'toString-impl',
  'constructor-impl',
]);

function accessorName(prefix: string, name: string): string {
  return `${prefix}${name.slice(0, 1).toUpperCase()}${name.slice(1)}`;
}

function accessorsOf(property: PropertyFacts): Accessors {
  const booleanForm = /^is[A-Z_]/.test(property.name);
  return {
    getters: booleanForm
      ? [property.name, accessorName('get', property.name)]
      : [accessorName('get', property.name)],
    setters: booleanForm
      ? [accessorName('set', property.name.slice(2)), accessorName('set', property.name)]
      : [accessorName('set', property.name)],
  };
}

function accessorMethod(method: string): string {
  return method.replace(/\$[A-Za-z_]\w*$/, '');
}

function writtenNames(entry: ClassFacts): Set<string> {
  const names = new Set(entry.functions);
  for (const property of entry.properties) {
    const { getters, setters } = accessorsOf(property);
    for (const name of property.getter ? getters : []) {
      names.add(name);
    }
    for (const name of property.setter ? setters : []) {
      names.add(name);
    }
  }
  return names;
}

export function generatedAccessor({ mutant, cls }: RuleContext): boolean {
  const method = accessorMethod(mutant.method);
  return (
    cls !== undefined &&
    cls.properties.some((property) => {
      const { getters, setters } = accessorsOf(property);
      const written =
        (property.getter && getters.includes(method)) ||
        (property.setter && setters.includes(method));
      const named = getters.includes(method) || setters.includes(method);
      const delegatedCall = property.delegated && !isReturn(mutant);
      return (
        named &&
        !written &&
        !delegatedCall &&
        mutant.line >= property.start &&
        mutant.line <= property.end
      );
    })
  );
}

export function generatedMember({ mutant, cls }: RuleContext): boolean {
  return (
    cls !== undefined &&
    cls.kind !== 'facade' &&
    mutant.method !== '<init>' &&
    mutant.method !== '<clinit>' &&
    mutant.line >= cls.start &&
    mutant.line <= cls.headerEnd &&
    !writtenNames(cls).has(unmangled(mutant.method))
  );
}

export function valueClassMember({ mutant, cls }: RuleContext): boolean {
  return (
    cls?.kind === 'value' &&
    VALUE_CLASS_GENERATED.has(mutant.method) &&
    !(mutant.method === 'constructor-impl' && cls.init) &&
    !cls.functions.includes(mutant.method.replace(/-impl0?$/, ''))
  );
}
