import { nameResolver, typeName } from '../spring/spring-names.mts';
import type { KotlinFile } from '../typed/kotlin-fact-types.mts';
import type { BlockingResolver } from '../typed/kotlin-flow-types.mts';

const resolverOf: (file: KotlinFile, declared: Set<string>) => (name: string) => string[] =
  nameResolver;
const plainTypeName: (text: string | undefined) => string = typeName;

export function lastSegment(name: string): string {
  return name.split('.').at(-1) ?? name;
}

export function resolverFor(file: KotlinFile, declared: Set<string>): BlockingResolver {
  const resolve = resolverOf(file, declared);
  return {
    resolve,
    isType: (name, qualified) =>
      name !== undefined && resolve(plainTypeName(name)).includes(qualified),
    importsFrom: (prefix) => file.imports.some(({ path }) => path.startsWith(prefix)),
  };
}
