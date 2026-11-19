import type { KotlinFile, FunctionFact } from '../typed/kotlin-fact-types.mts';
import type { BlockingProject, BlockingResolver } from '../typed/kotlin-flow-types.mts';
import { declaredNames, typeName } from '../spring/spring-names.mts';
import { projectContext, reachesType } from '../spring/view/project-types.mts';
import { BLOCKING_REPOSITORIES, REACTIVE_REPOSITORIES } from './blocking-catalog.mts';

const SUSPEND = 'suspend';

const REACTIVE_RESULTS = new Set(['Flow', 'Mono', 'Flux', 'Publisher', 'Deferred']);

function isNonBlocking({ modifiers, returnType }: FunctionFact): boolean {
  const result = typeName(returnType ?? '')
    .split('.')
    .at(-1);
  return modifiers.includes(SUSPEND) || (result !== undefined && REACTIVE_RESULTS.has(result));
}

function isBlockingRepository(
  context: ReturnType<typeof projectContext>,
  resolve: (name: string) => string[],
  text: string,
): boolean {
  return (
    reachesType(context, { resolve, text, targets: BLOCKING_REPOSITORIES }) &&
    !reachesType(context, { resolve, text, targets: REACTIVE_REPOSITORIES })
  );
}

export function projectIndex(
  files: KotlinFile[],
  { projectRoot, javaRoots = [] }: { projectRoot: string; javaRoots?: string[] | undefined },
): BlockingProject {
  const production = files.filter(({ test }) => !test);
  const declared = declaredNames(production);
  const context = projectContext({ projectFiles: production, declared, projectRoot, javaRoots });
  const functions = production.flatMap((file) => file.functions);
  return {
    declared,
    suspending: new Set(
      functions.filter(({ modifiers }) => modifiers.includes(SUSPEND)).map(({ name }) => name),
    ),
    plain: new Set(
      functions.filter(({ modifiers }) => !modifiers.includes(SUSPEND)).map(({ name }) => name),
    ),
    nonBlocking: new Set(functions.filter(isNonBlocking).map(({ name }) => name)),
    constructors: new Set(production.flatMap((file) => file.classes.map(({ name }) => name))),
    isBlockingRepository: (resolver: BlockingResolver, type) =>
      isBlockingRepository(context, resolver.resolve, type),
    declares: (name) => functions.some((fn) => fn.name === name),
  };
}
