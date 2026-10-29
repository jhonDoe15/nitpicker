import {
  importResolver,
  isGlobalScopeAlias,
  isScope,
  isScopeClass,
  isScopeExtension,
  launchBuilder,
} from './coroutine-names.mjs';

export const CHILD_OUTLIVES_RESOURCE_RULE = 'ChildCoroutineOutlivesResource';

function message({ builder, resource, scope }) {
  return `\`${builder}\` starts a child coroutine in ${scope}, which keeps running after this \`use\` block, and the child reads \`${resource}\`; \`use\` closes the resource when the block ends, so the child can run on a closed resource. Start the child inside \`coroutineScope { ... }\` or \`supervisorScope { ... }\` in the block, wait for the launched job before the block ends (\`job.join()\`, \`deferred.await()\` or \`joinAll(...)\`, outside any \`if\`, loop or \`catch\` that the launch is not in), or open and close the resource inside the child (\`scope.launch { open().use { ... } }\`).`;
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
      (launch.scopeType === undefined && isGlobalScopeAlias(resolves, launch.scope))
    );
  }
  if (launch.implicit === 'builder') {
    return true;
  }
  if (launch.implicit === 'class') {
    return isScopeClass(resolves, file, launch.owner);
  }
  return launch.implicit === 'extension' && isScopeExtension(resolves);
}

function isStandardUse(file) {
  return !file.functions.some(({ name }) => name === 'use');
}

export function childLifetimeFindings(files, { finding }) {
  return files
    .filter((file) => isStandardUse(file))
    .flatMap((file) => {
      const resolves = importResolver(file);
      return (file.useLaunches ?? []).flatMap((launch) => {
        const builder = launchBuilder(resolves, launch.launch);
        return builder !== undefined && outerScope(file, resolves, launch)
          ? [
              finding({
                tool: 'kotlin-source',
                rule: CHILD_OUTLIVES_RESOURCE_RULE,
                file: file.file,
                line: launch.line,
                symbol: `${launch.owner === undefined ? '' : `${launch.owner}.`}${launch.function}:${launch.opened}:${builder}`,
                message: message({ ...launch, builder, scope: scopeDescription(launch) }),
              }),
            ]
          : [];
      });
    });
}
