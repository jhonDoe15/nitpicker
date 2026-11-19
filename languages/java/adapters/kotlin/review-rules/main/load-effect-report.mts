import path from 'node:path';
import { shortCall } from '../../../../messages/load-effects.mts';
import type { KotlinFile } from '../typed/kotlin-fact-types.mts';
import type { LoadFact } from '../typed/kotlin-flow-types.mts';
import { declaredNames } from '../spring/spring-names.mts';

function placeOf(
  { kind, owner, member, site }: LoadFact['context'],
  file: KotlinFile,
): string | undefined {
  const outer = owner.replace(/\.[^.]+$/u, '');
  const where = site === undefined ? member : `${member}, which ${site} calls`;
  const places: Record<string, string> = {
    file: `${path.basename(file.file)} loads (in top-level ${where})`,
    object: `object ${owner} loads (in ${where})`,
    companion: `the companion object of ${outer} loads (in ${where})`,
    enum: `enum class ${owner} loads (in ${where})`,
    singleton: `the companion object of ${owner} loads and creates a ${owner} (in ${where})`,
  };
  return places[kind];
}

export function messageOf(item: LoadFact, file: KotlinFile): string {
  return `Do this work in a function that main or the framework calls after startup (a @Bean method, an ApplicationRunner, a Ktor module) and pass the result in, or defer it with by lazy: \`${shortCall(item.text)}\` runs while ${String(placeOf(item.context, file))}, so it connects, starts threads or touches files in whatever order classes load, and in every test that touches it. Constants, loggers, Regex and collections can stay, and the top-level code of a file with fun main is not checked.`;
}

export function entryOwners(file: KotlinFile): Set<string> {
  return new Set(
    file.functions
      .filter(
        ({ name, owner, annotations = [] }) =>
          name === 'main' && (owner === '' || annotations.includes('JvmStatic')),
      )
      .map(({ owner }) => owner),
  );
}

export function declaredClasses(files: KotlinFile[]): Set<string> {
  return declaredNames(files);
}
