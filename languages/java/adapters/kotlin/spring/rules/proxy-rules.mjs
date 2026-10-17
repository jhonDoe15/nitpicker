import { hasArgument } from '../syntax/kotlin-annotations.mjs';
import { callsIn, isSelfCall } from '../syntax/kotlin-calls.mjs';
import { descendants, kid } from '../syntax/kotlin-tree.mjs';
import { typeOf } from '../syntax/kotlin-types.mjs';
import {
  ASYNC,
  CONTROLLERS,
  FOREIGN_TRANSACTIONAL,
  PROXY_ANNOTATIONS,
  SCHEDULED,
  TRANSACTIONAL,
} from '../names/spring-annotations.mjs';
import { COMPLETABLE_FUTURE } from '../names/spring-body-types.mjs';
import { BROAD_EXCEPTIONS, PERSISTENCE_EXCEPTIONS } from '../names/spring-types.mjs';
import {
  argumentMatches,
  defineRule,
  hasAnnotation,
  hitAt,
  hitOn,
  memberSymbolOf,
  sitesOfType,
} from './rule-support.mjs';

const NON_PUBLIC = ['private', 'protected', 'internal'];
const EXCEPTIONS = new Set([...BROAD_EXCEPTIONS, ...PERSISTENCE_EXCEPTIONS]);
const SWALLOWED_BOUNDARIES = new Set(['LAMBDA_EXPRESSION', 'OBJECT_LITERAL']);

const methodVisibility = defineRule(
  'SpringProxyMethodVisibility',
  'Make this proxied function public and open, in a class that is not final. Spring never proxies final functions, and nitpicker keeps proxied functions public.',
  (file) =>
    sitesOfType(file, PROXY_ANNOTATIONS)
      .filter((site) => {
        if (site.kind === 'class') {
          return site.decl.modifiers.has('final');
        }
        return (
          site.kind === 'function' &&
          site.owner?.kind !== 'interface' &&
          (NON_PUBLIC.some((modifier) => site.decl.modifiers.has(modifier)) ||
            site.decl.modifiers.has('final'))
        );
      })
      .map(hitAt),
);

function arityRange(member) {
  const required = member.params.filter((parameter) => !parameter.defaulted).length;
  return [required, member.params.length];
}

function proxiedCallees(file, declaration, call) {
  return (declaration.owner?.functions ?? []).filter((candidate) => {
    const [least, most] = arityRange(candidate);
    return (
      candidate.name === call.name &&
      call.arguments.length >= least &&
      call.arguments.length <= most &&
      candidate.annotations.some((annotation) =>
        file.resolver.matches(annotation.name, PROXY_ANNOTATIONS),
      )
    );
  });
}

function bypassesProxy(file, caller, callee) {
  const callerTransactional = hasAnnotation(file, caller, TRANSACTIONAL);
  return callee.annotations
    .filter((annotation) => file.resolver.matches(annotation.name, PROXY_ANNOTATIONS))
    .some(
      (annotation) =>
        !(
          callerTransactional &&
          annotation.args.length === 0 &&
          file.resolver.matches(annotation.name, TRANSACTIONAL)
        ),
    );
}

const selfCall = defineRule(
  'SpringProxySelfCall',
  "This call stays inside the class, so it skips the proxy and the called function's annotation does nothing. Move the annotated function to another bean and call it there.",
  (file) =>
    file.functions
      .filter((declaration) => declaration.body !== undefined && declaration.owner !== undefined)
      .flatMap((declaration) =>
        callsIn(file.source, declaration.body)
          .filter((call) => !call.reference && isSelfCall(call))
          .filter((call) =>
            proxiedCallees(file, declaration, call).some((callee) =>
              bypassesProxy(file, declaration, callee),
            ),
          )
          .map((call) => hitOn(call.node, memberSymbolOf(declaration))),
      ),
);

const foreignTransactional = defineRule(
  'SpringTransactionalAnnotation',
  'Use org.springframework.transaction.annotation.Transactional. The jakarta and javax annotations have no readOnly or timeout and roll back on different exceptions.',
  (file) => sitesOfType(file, FOREIGN_TRANSACTIONAL).map(hitAt),
);

const transactionalController = defineRule(
  'SpringNoTransactionalController',
  'Put @Transactional on a service function, not on a controller; a controller transaction spans the whole request and response serialization.',
  (file) =>
    sitesOfType(file, TRANSACTIONAL)
      .filter((site) => ['class', 'function'].includes(site.kind))
      .filter((site) => site.owner !== undefined && hasAnnotation(file, site.owner, CONTROLLERS))
      .map(hitAt),
);

const requiresNew = defineRule(
  'SpringNoRequiresNew',
  'Avoid Propagation.REQUIRES_NEW: each nested transaction holds a second connection and can exhaust the pool under load.',
  (file) =>
    sitesOfType(file, TRANSACTIONAL)
      .filter((site) => argumentMatches(site.annotation, 'propagation', /\bREQUIRES_NEW\b/))
      .map(hitAt),
);

function isTransactionalFunction(file, declaration) {
  return (
    hasAnnotation(file, declaration, TRANSACTIONAL) ||
    (!NON_PUBLIC.some((modifier) => declaration.modifiers.has(modifier)) &&
      declaration.owner !== undefined &&
      hasAnnotation(file, declaration.owner, TRANSACTIONAL))
  );
}

function swallowingCatches(file, declaration) {
  return descendants(declaration.body, (node) => node.t === 'CATCH')
    .filter((node) => descendants(node, (child) => child.t === 'THROW').length === 0)
    .filter((node) => {
      const parameter = kid(kid(node, 'VALUE_PARAMETER_LIST'), 'VALUE_PARAMETER');
      const type = typeOf(file.source, kid(parameter, 'TYPE_REFERENCE'));
      return type !== undefined && file.resolver.matches(type.name, EXCEPTIONS);
    });
}

function insideBoundary(declaration, catchNode) {
  const lambdas = descendants(declaration.body, (node) => SWALLOWED_BOUNDARIES.has(node.t));
  return lambdas.some((lambda) => descendants(lambda, (node) => node === catchNode).length > 0);
}

const swallowedException = defineRule(
  'SpringNoSwallowedTransactionException',
  'Do not swallow a broad or persistence exception inside a @Transactional function: the transaction may already be rollback-only, so the commit fails anyway. Rethrow it, or catch it in the caller.',
  (file) =>
    file.functions
      .filter((declaration) => declaration.body !== undefined)
      .filter((declaration) => isTransactionalFunction(file, declaration))
      .flatMap((declaration) =>
        swallowingCatches(file, declaration)
          .filter((node) => !insideBoundary(declaration, node))
          .map((node) => hitOn(node, memberSymbolOf(declaration))),
      ),
);

const asyncExecutor = defineRule(
  'SpringAsyncExecutor',
  'Name a bounded executor bean, @Async("executorName"), and return CompletableFuture so failures reach the caller.',
  (file) => [
    ...sitesOfType(file, ASYNC)
      .filter((site) => site.annotation.args.length === 0)
      .map(hitAt),
    ...file.functions
      .filter((declaration) => hasAnnotation(file, declaration, ASYNC))
      .filter(
        (declaration) =>
          !(
            declaration.returnType !== undefined &&
            file.resolver.matches(declaration.returnType.name, COMPLETABLE_FUTURE)
          ),
      )
      .map((declaration) => hitOn(declaration.node, memberSymbolOf(declaration))),
  ],
);

const fixedDelay = defineRule(
  'SpringScheduledFixedDelay',
  'Use fixedDelay or cron instead of fixedRate, so a slow run never overlaps the next one.',
  (file) =>
    sitesOfType(file, SCHEDULED)
      .filter(
        ({ annotation }) =>
          hasArgument(annotation, 'fixedRate') || hasArgument(annotation, 'fixedRateString'),
      )
      .map(hitAt),
);

export const PROXY_RULES = [
  methodVisibility,
  selfCall,
  foreignTransactional,
  transactionalController,
  requiresNew,
  swallowedException,
  asyncExecutor,
  fixedDelay,
];
