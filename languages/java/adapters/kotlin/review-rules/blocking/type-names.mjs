import { nameResolver, typeName } from '../spring/spring-names.mjs';

export function lastSegment(name) {
  return name.split('.').at(-1);
}

export function resolverFor(file, declared) {
  const resolve = nameResolver(file, declared);
  return {
    resolve,
    isType: (name, qualified) => name !== undefined && resolve(typeName(name)).includes(qualified),
    importsFrom: (prefix) => file.imports.some(({ path }) => path.startsWith(prefix)),
  };
}
