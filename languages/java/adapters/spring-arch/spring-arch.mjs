import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const SPRING_ARCH_REPORT = 'spring-arch.json';
const TOOL = 'archunit';

const MESSAGES = {
  'spring-layout': ({ simple, detail, root }) =>
    detail === ''
      ? `${simple} sits in the root package ${root}. Put it in a feature package (${root}.<feature>); the root package holds only the application and @Configuration classes.`
      : `${simple} is in the layer package "${detail}". Group by feature instead: ${root}.<feature> holds its controller, service and repository together, and pure utilities go to ${root}.shared.`,
  'spring-feature-boundary': ({ simple, detail, root }) =>
    `${simple} uses ${detail}, inside another feature. Depend only on classes in the other feature's top package, or move what both need to ${root}.shared.`,
  'spring-shared-pure': ({ simple, detail }) =>
    detail === ''
      ? `${simple} is a Spring bean or entity in the shared package. shared holds pure utilities; move it into the feature that owns it.`
      : `${simple} depends on ${detail}, a feature class. shared holds pure utilities and depends on no feature; move the code into the feature that uses it.`,
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

export function readSpringArchFindings(reportRoot, { resolvePath }) {
  const file = path.join(reportRoot, SPRING_ARCH_REPORT);
  if (!existsSync(file)) {
    throw new Error(`The Spring architecture report ${SPRING_ARCH_REPORT} is missing`);
  }
  const { root, violations } = JSON.parse(readFileSync(file, 'utf8'));
  return violations.flatMap(({ rule, className, fileName, detail }) => {
    const filePath = resolvePath(className, fileName === '' ? undefined : fileName);
    const describe = MESSAGES[rule];
    if (describe === undefined) {
      throw new Error(`Unknown Spring architecture rule ${rule} in ${SPRING_ARCH_REPORT}`);
    }
    if (filePath === undefined) {
      return [];
    }
    const message = describe({
      simple: simpleName(className),
      detail: shortDetail(detail),
      root,
      packageName: packageOf(className),
    });
    return [
      {
        tool: TOOL,
        rule,
        path: filePath,
        identity: detail === '' ? className : `${className}|${detail}`,
        message: `${message} ${exceptionRoute(rule)}`,
        classification: 'enforceable',
        symbol: className,
      },
    ];
  });
}
