import { isReturn, unmangled } from './mutant-kinds.mjs';

const VALUE_CLASS_GENERATED = new Set([
  'box-impl',
  'unbox-impl',
  'equals-impl',
  'equals-impl0',
  'hashCode-impl',
  'toString-impl',
  'constructor-impl',
]);

function accessorName(prefix, name) {
  return `${prefix}${name[0].toUpperCase()}${name.slice(1)}`;
}

function accessorsOf(property) {
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

function accessorMethod(method) {
  return method.replace(/\$[A-Za-z_]\w*$/, '');
}

function writtenNames(entry) {
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

function generatedAccessor({ mutant, cls }) {
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

function generatedMember({ mutant, cls }) {
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

function valueClassMember({ mutant, cls }) {
  return (
    cls?.kind === 'value' &&
    VALUE_CLASS_GENERATED.has(mutant.method) &&
    !(mutant.method === 'constructor-impl' && cls.init) &&
    !cls.functions.includes(mutant.method.replace(/-impl0?$/, ''))
  );
}

export { generatedAccessor, generatedMember, valueClassMember };
