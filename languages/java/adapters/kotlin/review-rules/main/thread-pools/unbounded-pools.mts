import type { InvocationFact, KotlinFile, ScopeFact } from '../../typed/kotlin-fact-types.mts';
import type { ReviewFinding, RuleOptions } from '../../typed/review-finding-types.mts';

export const UNBOUNDED_POOL_RULE = 'UnboundedThreadPool';

const MESSAGE =
  'Use a bounded pool, such as Executors.newFixedThreadPool(n), a ThreadPoolExecutor with a bounded maximum size and queue (in Spring, a ThreadPoolTaskExecutor with a queue capacity) or Dispatchers.IO.limitedParallelism(n). A cached pool starts a new thread for every task that finds no idle thread, with no upper limit, so a burst of tasks can exhaust memory and native threads.';
const CONCURRENT = 'java.util.concurrent';
const EXECUTORS = `${CONCURRENT}.Executors`;
const POOL = `${CONCURRENT}.ThreadPoolExecutor`;
const MAX_VALUE = /^(?:(?:kotlin\.)?Int|(?:java\.lang\.)?Integer)\.MAX_VALUE$/u;

function resolves(file: KotlinFile, text: string, fqn: string): boolean {
  if (text === fqn) {
    return true;
  }
  const [first, ...rest] = text.split('.');
  const simple = fqn.split('.').at(-1);
  const explicit = file.imports.find(
    ({ path, alias, all }) => !all && (alias ?? path.split('.').at(-1)) === first,
  );
  if (explicit !== undefined) {
    return [explicit.path, ...rest].join('.') === fqn;
  }
  const owner = fqn.slice(0, fqn.lastIndexOf('.'));
  return (
    text === simple &&
    (file.imports.some(({ path, all }) => all && path === owner) || file.package === owner)
  );
}

function cachedPool(file: KotlinFile, invocation: InvocationFact): boolean {
  if (invocation.name !== 'newCachedThreadPool') {
    return false;
  }
  return invocation.receiver === undefined
    ? resolves(file, invocation.name, `${EXECUTORS}.newCachedThreadPool`)
    : resolves(file, invocation.receiver, EXECUTORS);
}

function unboundedConstructor(file: KotlinFile, invocation: InvocationFact): boolean {
  const name =
    invocation.receiver === undefined
      ? invocation.name
      : `${invocation.receiver}.${invocation.name}`;
  return resolves(file, name, POOL) && MAX_VALUE.test(invocation.arguments[1]?.text ?? '');
}

function scopesOf(file: { scopes?: ScopeFact[] | undefined }): ScopeFact[] {
  return file.scopes ?? [];
}

function invocationsOf(file: { invocations?: InvocationFact[] | undefined }): InvocationFact[] {
  return file.invocations ?? [];
}

function chainOf(scopes: Map<number, ScopeFact>, id: number): ScopeFact[] {
  const chain = [scopes.get(id)].filter((scope) => scope !== undefined);
  for (const scope of chain) {
    const parent = scope.parent === undefined ? undefined : scopes.get(scope.parent);
    if (parent !== undefined && !chain.includes(parent)) {
      chain.push(parent);
    }
  }
  return chain;
}

function symbolOf(file: KotlinFile, invocation: InvocationFact): string {
  const chain = chainOf(
    new Map(scopesOf(file).map((scope) => [scope.id, scope])),
    invocation.scope,
  );
  const owner = chain.find(({ k }) => k === 'class')?.qualified;
  const fn = chain.find(({ k, name }) => k === 'fun' && name !== undefined)?.name;
  return [owner, fn, invocation.name].filter((part) => part !== undefined && part !== '').join('.');
}

export function unboundedPoolFindings(
  files: KotlinFile[],
  { finding }: RuleOptions,
): ReviewFinding[] {
  return files
    .filter(({ test }) => !test)
    .flatMap((file) =>
      invocationsOf(file)
        .filter(
          (invocation) =>
            invocation.assign !== true &&
            invocation.reference !== true &&
            (cachedPool(file, invocation) || unboundedConstructor(file, invocation)),
        )
        .map((invocation) =>
          finding({
            rule: UNBOUNDED_POOL_RULE,
            file: file.file,
            line: invocation.line,
            symbol: symbolOf(file, invocation),
            message: MESSAGE,
          }),
        ),
    );
}
