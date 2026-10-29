import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter } from '../../../../shared/ingest/common.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { isIntegrationTest } from '../test-times/integration-tests.mjs';
import { CONTRACT_RULE, contractEntry, keepsContract, simpleName } from './contract-types.mjs';

export const SPRING_ARCH_REPORT = 'spring-arch.json';
const TOOL = 'archunit';

const MESSAGES = {
  'spring-layout': ({ simple, detail, root }) =>
    detail === ''
      ? `Put ${simple} in a feature package ${root}.<feature>: the root package ${root} holds only the application, @Configuration and @ConfigurationProperties classes.`
      : `Put ${simple} in the feature package it belongs to, ${root}.<feature>, which holds that feature's controller, service and repository together (pure utilities go to ${root}.shared); "${detail}" is a layer package.`,
  'spring-feature-boundary': ({ simple, detail, target, root }) =>
    `Have ${simple} use only the classes directly in ${target.rootPackage}, or move what both need to ${root}.shared: ${detail} is internal to that feature (${target.packageName}).`,
  'spring-shared-pure': ({ simple, detail, target, root }) =>
    detail === ''
      ? `Move ${simple} into the feature that owns it: ${root}.shared holds only pure utilities, not Spring beans or entities.`
      : `Move ${simple} into the package that uses it, or drop its use of ${detail}: ${root}.shared holds pure utilities and depends on no feature package such as ${target.rootPackage}.`,
  'spring-controller-repository': ({ simple, detail }) =>
    `Have ${simple} call a service that uses ${detail}: controllers call services only, not repositories or data access.`,
  'spring-controller-entity': ({ simple, detail }) => {
    const [method, entity] = detail.split(':');
    return `Take and return a record (DTO) in ${simple}.${method} and map it in the service: the entity ${entity} stays out of controller signatures.`;
  },
  'spring-service-web': ({ simple, detail }) =>
    `Keep ${simple} free of web types: take and return plain values, throw a domain exception for errors, and map them to and from ${detail} in the controller or a @ControllerAdvice.`,
  'spring-controller-controller': ({ simple, detail }) =>
    `Move what ${simple} needs from ${detail} into a service both controllers call: a controller handles its own requests and does not hold another controller.`,
  'spring-repository-service': ({ simple, detail }) =>
    `Have the service call ${simple} and pass it what it needs from ${detail}: a repository only reads and writes data and depends on no service.`,
  'spring-scope-capture': ({ simple, detail }) => {
    const parts = detail.split(':');
    const [scope, bean] = parts.slice(parts.length - 2);
    const method = parts.length > 2 ? parts[0] : '';
    const consumer = method === '' ? simple : `the bean ${simple}.${method}`;
    return `Inject ObjectProvider<${bean}> into ${consumer} and call getObject() per use, or give ${bean} a scoped proxy (proxyMode = ScopedProxyMode.TARGET_CLASS): a singleton gets one ${bean} when it is created, which fails outside a ${scope} and otherwise keeps the first ${scope}'s bean.`;
  },
  'ddd-aggregate-reference': ({ simple, detail }) =>
    `Refer to ${detail} by its identifier or an Association<${detail}, ID> in ${simple}: ${detail} is the root of another aggregate, and holding it lets one aggregate change another outside its consistency boundary.`,
  'ddd-foreign-entity': ({ simple, detail }) => {
    const [aggregate, entity] = detail.split(':');
    return `Refer to ${aggregate} by its identifier in ${simple} instead of holding ${entity}: ${entity} belongs to the aggregate ${aggregate}, and an entity belongs to exactly one aggregate.`;
  },
  'ddd-value-object-reference': ({ simple, detail }) =>
    `Hold the identifier of ${detail} in ${simple}, not the object: a value object is compared by its values, and ${detail} is an entity with an identity and lifecycle of its own.`,
  'spring-test-placement': ({ simple }) =>
    `Test ${simple} with new and mocks, or run it as an integration test: name it ${simple.replace(/Tests?$/u, '')}IT (Failsafe runs *IT on Maven) or put it in an integration test source set. Both keep its package, so package-private classes stay visible; a package named integration or it also counts.`,
  'spring-no-dirties-context': ({ simple }) =>
    `Reset state in ${simple} itself, or test the class without a Spring context: @DirtiesContext rebuilds the context and slows the suite.`,
};

const PLACEMENT = 'spring-test-placement';
const BOUNDARY = 'spring-feature-boundary';
const DEPENDENCY_RULES = new Set([
  'spring-controller-repository',
  'spring-controller-controller',
  'spring-repository-service',
  'spring-service-web',
]);

function packageOf(name) {
  return name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : '';
}

function shortDetail(detail) {
  return detail.split(':').map(simpleName).join(':');
}

function targetOf(detail, root) {
  const packageName = packageOf(detail);
  const [segment] = packageName.slice(root.length + 1).split('.');
  return { packageName, rootPackage: `${root}.${segment}` };
}

function describeEntry({ rule, className, detail }, root) {
  if (rule === CONTRACT_RULE) {
    return contractEntry(className, detail);
  }
  const describe = MESSAGES[rule];
  if (describe === undefined) {
    throw new Error(`Unknown Spring architecture rule ${rule} in ${SPRING_ARCH_REPORT}`);
  }
  const simple = simpleName(className);
  const short = shortDetail(detail);
  return {
    key: short === '' ? simple : `${simple}|${short}`,
    symbol: simple,
    message: describe({
      simple,
      detail: short,
      root,
      target: root === null ? undefined : targetOf(detail, root),
    }),
  };
}

function isKept(violation, filePath, options) {
  const { rule, className, detail } = violation;
  if (filePath === undefined) {
    return false;
  }
  if (rule === CONTRACT_RULE) {
    return keepsContract(detail, filePath, options.isFeatureFace ?? (() => false));
  }
  return (
    options.spring !== false &&
    !(rule === PLACEMENT && isIntegrationTest({ className, unitSource: true })) &&
    !(rule === BOUNDARY && options.shown.has(dependencyKey(violation)))
  );
}

function violationPath(resolvePath, { className, fileName }) {
  return resolvePath(className, fileName === '' ? undefined : fileName);
}

function dependencyKey({ className, detail }) {
  return `${className}|${detail}`;
}

function shownDependencies(violations, resolvePath, isExcepted) {
  return new Set(
    violations
      .filter(
        (violation) =>
          DEPENDENCY_RULES.has(violation.rule) &&
          !isExcepted(`${TOOL}/${violation.rule}`, violationPath(resolvePath, violation)),
      )
      .map(dependencyKey),
  );
}

export function readSpringArchFindings(reportRoot, options) {
  const { resolvePath, isExcepted = () => false } = options;
  const file = path.join(reportRoot, SPRING_ARCH_REPORT);
  if (!existsSync(file)) {
    throw new Error(`The Spring architecture report ${SPRING_ARCH_REPORT} is missing`);
  }
  const { root, violations } = JSON.parse(readFileSync(file, 'utf8'));
  const shown = shownDependencies(violations, resolvePath, isExcepted);
  const counters = new Map();
  return violations.flatMap((violation) => {
    const { rule } = violation;
    const filePath = violationPath(resolvePath, violation);
    const entry = describeEntry(violation, root);
    if (!isKept(violation, filePath, { ...options, shown })) {
      return [];
    }
    const unique = counters.get(filePath) ?? createIdentityCounter();
    counters.set(filePath, unique);
    return [
      {
        tool: TOOL,
        rule,
        path: filePath,
        identity: unique(`${rule}:${entry.key}`).slice(rule.length + 1),
        message: `${entry.message} ${exceptionHint(`${TOOL}/${rule}`, filePath)}`,
        classification: 'enforceable',
        symbol: entry.symbol,
      },
    ];
  });
}
