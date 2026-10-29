import { declaredNames, typeName } from '../spring/spring-names.mjs';
import { projectContext, reachesType } from '../spring/view/project-types.mjs';
import { BLOCKING_REPOSITORIES, REACTIVE_REPOSITORIES } from './blocking-catalog.mjs';

const REACTIVE_RESULTS = new Set(['Flow', 'Mono', 'Flux', 'Publisher', 'Deferred']);

function isNonBlocking({ modifiers, returnType }) {
  const result = typeName(returnType ?? '')
    .split('.')
    .at(-1);
  return modifiers.includes('suspend') || REACTIVE_RESULTS.has(result);
}

export function projectIndex(files, { projectRoot, javaRoots = [] } = {}) {
  const production = files.filter(({ test }) => !test);
  const declared = declaredNames(production);
  const context = projectContext({ projectFiles: production, declared, projectRoot, javaRoots });
  const functions = production.flatMap((file) => file.functions);
  const reaches = (resolver, type, targets) =>
    reachesType(context, resolver.resolve, type, targets);
  return {
    declared,
    suspending: new Set(
      functions.filter(({ modifiers }) => modifiers.includes('suspend')).map(({ name }) => name),
    ),
    plain: new Set(
      functions.filter(({ modifiers }) => !modifiers.includes('suspend')).map(({ name }) => name),
    ),
    nonBlocking: new Set(functions.filter(isNonBlocking).map(({ name }) => name)),
    constructors: new Set(production.flatMap((file) => file.classes.map(({ name }) => name))),
    isBlockingRepository: (resolver, type) =>
      reaches(resolver, type, BLOCKING_REPOSITORIES) &&
      !reaches(resolver, type, REACTIVE_REPOSITORIES),
    declares: (name) => functions.some((fn) => fn.name === name),
  };
}
