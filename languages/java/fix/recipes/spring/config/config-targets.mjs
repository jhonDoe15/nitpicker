import {
  ENTRY_RULES,
  flaggedEntries,
  openInViewSites,
} from '../../../../adapters/spring/java-spring.mjs';
import { readSpringDocuments, usesJpa } from '../../../../adapters/spring/spring-config-files.mjs';
import {
  readTestProfiles,
  withProfileKinds,
} from '../../../../adapters/spring/spring-profiles.mjs';

export const SPRING_CONFIG_FILE =
  /(?:^|\/)src\/main\/resources\/(?:config\/)?application(?:-[^/]+)?\.(?:properties|ya?ml)$/u;
const RESOURCES = 'src/main/resources';

function moduleOf(file) {
  return file.slice(0, file.indexOf(RESOURCES));
}

function moduleTargets(projectRoot, prefix) {
  const documents = withProfileKinds(
    readSpringDocuments(projectRoot, [`${prefix}${RESOURCES}`]),
    readTestProfiles(projectRoot, [`${prefix}src/test/java`, `${prefix}src/test/kotlin`]),
  );
  const sourceRoots = [`${prefix}src/main/java`, `${prefix}src/main/kotlin`];
  const view = usesJpa(projectRoot, sourceRoots)
    ? openInViewSites(documents)
    : { enabled: [], missingIn: undefined };
  return [
    ...ENTRY_RULES.flatMap((spec) =>
      flaggedEntries(documents, spec).map((target) => ({ ...target, rule: spec.rule })),
    ),
    ...view.enabled.map((target) => ({ ...target, rule: 'open-in-view' })),
    ...(view.missingIn === undefined
      ? []
      : [{ document: view.missingIn, entry: undefined, rule: 'open-in-view' }]),
  ].map((target) => ({ ...target, path: target.document.path, documents }));
}

export function springConfigTargets({ projectRoot, files }) {
  const changed = new Set(
    files.map(({ path: name }) => name).filter((name) => SPRING_CONFIG_FILE.test(name)),
  );
  const prefixes = [...new Set([...changed].map(moduleOf))];
  return prefixes
    .flatMap((prefix) => moduleTargets(projectRoot, prefix))
    .filter(({ path: name }) => changed.has(name));
}
