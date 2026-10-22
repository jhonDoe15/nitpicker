import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createIdentityCounter } from '../../../../shared/ingest/common.mjs';

export const SPRING_ARCH_REPORT = 'spring-arch.json';
const TOOL = 'archunit';

const MESSAGES = {
  'spring-layout': ({ simple, detail, root }) =>
    detail === ''
      ? `${simple} sits in the root package ${root}. Put it in a feature package (${root}.<feature>); the root package holds only the application and @Configuration classes.`
      : `${simple} is in the layer package "${detail}". Group by feature instead: ${root}.<feature> holds its controller, service and repository together, and pure utilities go to ${root}.shared.`,
  'spring-feature-boundary': ({ simple, detail, target, root }) =>
    `${simple} uses ${detail} from ${target.packageName}, inside another root package ${target.rootPackage}. Depend only on the classes directly in ${target.rootPackage}, or move what both need to ${root}.shared.`,
  'spring-shared-pure': ({ simple, detail, target }) =>
    detail === ''
      ? `${simple} is a Spring bean or entity in the shared package. shared holds pure utilities; move it into the feature that owns it.`
      : `${simple} depends on ${detail} in ${target.rootPackage}. shared holds pure utilities and depends on no other root package; move the code into the package that uses it.`,
  'spring-controller-repository': ({ simple, detail }) =>
    `${simple} depends on repository ${detail}. Controllers call services only; inject a service and let it use the repository.`,
  'spring-controller-entity': ({ simple, detail }) => {
    const [method, entity] = detail.split(':');
    return `${simple}.${method} exposes the entity ${entity} in its signature. Take and return a record (DTO) and map it in the service.`;
  },
  'spring-service-web': ({ simple, detail }) =>
    `${simple} depends on ${detail}, a web type. Services and repositories do not know the web layer; pass plain values and map them in the controller.`,
  'spring-test-placement': ({ simple, packageName }) =>
    `${simple} starts a Spring context outside an integration package. Move it to ${packageName}.integration (a package named integration or it), or test the class directly with new and mocks.`,
  'spring-no-dirties-context': ({ simple }) =>
    `${simple} uses @DirtiesContext, which rebuilds the context and slows the suite. Remove it: reset state in the test, or test the class without a context.`,
};

function exceptionRoute(rule) {
  return `If it is right here, add an exception for ${TOOL}/${rule} in nitpicker.config.json.`;
}

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

export function readSpringArchFindings(reportRoot, { resolvePath }) {
  const file = path.join(reportRoot, SPRING_ARCH_REPORT);
  if (!existsSync(file)) {
    throw new Error(`The Spring architecture report ${SPRING_ARCH_REPORT} is missing`);
  }
  const { root, violations } = JSON.parse(readFileSync(file, 'utf8'));
  const unique = createIdentityCounter();
  return violations.flatMap(({ rule, className, fileName, detail }) => {
    const filePath = resolvePath(className, fileName === '' ? undefined : fileName);
    const describe = MESSAGES[rule];
    if (describe === undefined) {
      throw new Error(`Unknown Spring architecture rule ${rule} in ${SPRING_ARCH_REPORT}`);
    }
    if (filePath === undefined) {
      return [];
    }
    const simple = simpleName(className);
    const short = shortDetail(detail);
    const message = describe({
      simple,
      detail: short,
      root,
      target: root === null ? undefined : targetOf(detail, root),
      packageName: packageOf(className),
    });
    return [
      {
        tool: TOOL,
        rule,
        path: filePath,
        identity: unique(`${rule}:${short === '' ? simple : `${simple}|${short}`}`).slice(
          rule.length + 1,
        ),
        message: `${message} ${exceptionRoute(rule)}`,
        classification: 'enforceable',
        symbol: simple,
      },
    ];
  });
}
