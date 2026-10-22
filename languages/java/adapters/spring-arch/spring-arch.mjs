import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter } from '../../../../shared/ingest/common.mjs';
import { exceptionHint } from '../../../../shared/rules/exceptions.mjs';
import { isIntegrationTest } from '../test-times/integration-tests.mjs';
import { CONTRACT_RULE, contractEntry, keepsContract } from './contract-types.mjs';

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
  'spring-test-placement': ({ simple }) =>
    `Test ${simple} with new and mocks, or run it as an integration test: name it ${simple.replace(/Tests?$/u, '')}IT (Failsafe runs *IT on Maven) or put it in an integration test source set. Both keep its package, so package-private classes stay visible; a package named integration or it also counts.`,
  'spring-no-dirties-context': ({ simple }) =>
    `Reset state in ${simple} itself, or test the class without a Spring context: @DirtiesContext rebuilds the context and slows the suite.`,
};

const PLACEMENT = 'spring-test-placement';

function simpleName(name) {
  return name.slice(name.lastIndexOf('.') + 1);
}

function packageOf(name) {
  return name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : '';
}

function shortDetail(detail) {
  return detail.includes(':')
    ? `${detail.split(':')[0]}:${simpleName(detail.split(':')[1])}`
    : simpleName(detail);
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

function isKept({ rule, className, detail }, filePath, options) {
  if (filePath === undefined) {
    return false;
  }
  if (rule === CONTRACT_RULE) {
    return keepsContract(detail, filePath, options.isFeatureFace ?? (() => false));
  }
  return (
    options.spring !== false &&
    !(rule === PLACEMENT && isIntegrationTest({ className, unitSource: true }))
  );
}

export function readSpringArchFindings(reportRoot, options) {
  const file = path.join(reportRoot, SPRING_ARCH_REPORT);
  if (!existsSync(file)) {
    throw new Error(`The Spring architecture report ${SPRING_ARCH_REPORT} is missing`);
  }
  const { root, violations } = JSON.parse(readFileSync(file, 'utf8'));
  const counters = new Map();
  return violations.flatMap((violation) => {
    const { rule, className, fileName } = violation;
    const filePath = options.resolvePath(className, fileName === '' ? undefined : fileName);
    const entry = describeEntry(violation, root);
    if (!isKept(violation, filePath, options)) {
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
