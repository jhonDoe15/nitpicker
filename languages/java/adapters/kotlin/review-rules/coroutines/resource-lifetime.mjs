import {
  importResolver,
  isGlobalScope,
  isScope,
  isScopeClass,
  isScopeExtension,
  resolvesAs,
} from './coroutine-names.mjs';

export const CHILD_OUTLIVES_RESOURCE_RULE = 'ChildCoroutineOutlivesResource';

const LAUNCH_NAMES = new Set(['launch', 'async']);
function message({ launch, resource, scope }) {
  return `\`${launch}\` starts a child coroutine in ${scope}, which keeps running after this \`use\` block, and the child reads \`${resource}\`; \`use\` closes \`${resource}\` when the block ends, so the child can run on a closed resource. Start the child inside \`coroutineScope { ... }\` or \`supervisorScope { ... }\` in the block, join it before the block ends (\`.join()\` or \`.await()\`), or open and close the resource inside the child (\`scope.launch { ${resource === 'it' ? 'resource' : resource}.use { ... } }\`).`;
}

function scopeDescription({ scope, implicit }) {
  return scope === undefined
    ? `the ${implicit === 'builder' ? "enclosing coroutine builder's scope" : 'enclosing CoroutineScope'}`
    : `\`${scope}\``;
}

function outerScope(file, resolves, launch) {
  if (launch.scope !== undefined) {
    return (
      isScope(resolves, file, launch.scopeType) ||
      (launch.scopeType === undefined && isGlobalScope(resolves, launch.scope))
    );
  }
  if (launch.implicit === 'builder') {
    return true;
  }
  if (launch.implicit === 'class') {
    return isScopeClass(resolves, file, launch.owner);
  }
  return launch.implicit === 'extension' && isScopeExtension(resolves, 'CoroutineScope');
}

function isStandardUse(file) {
  return !file.functions.some(({ name }) => name === 'use');
}

export function childLifetimeFindings(files, { finding }) {
  return files
    .filter((file) => isStandardUse(file))
    .flatMap((file) => {
      const resolves = importResolver(file);
      return (file.useLaunches ?? [])
        .filter(
          (launch) =>
            LAUNCH_NAMES.has(launch.launch) &&
            resolvesAs(resolves, launch.launch, launch.launch) &&
            outerScope(file, resolves, launch),
        )
        .map((launch) =>
          finding({
            tool: 'kotlin-source',
            rule: CHILD_OUTLIVES_RESOURCE_RULE,
            file: file.file,
            line: launch.line,
            symbol: `${launch.owner === undefined ? '' : `${launch.owner}.`}${launch.function}:${launch.resource}:${launch.launch}`,
            message: message({ ...launch, scope: scopeDescription(launch) }),
          }),
        );
    });
}
