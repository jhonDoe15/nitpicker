import { insideClass, simpleTypeName } from '../kotlin-facts.mjs';

export const SPRING_UNUSED_CONTEXT_RULE = 'SpringUnusedContext';

const ALLOWED_FORM =
  'Make this @SpringBootTest a unit test that creates the class with its constructor, or use a slice such as @WebMvcTest for one layer; @SpringBootTest is for integration and component tests.';
const MESSAGE = `${ALLOWED_FORM} This one starts the whole application context but uses nothing from it: no injected or mock bean, no MockMvc, WebTestClient, TestRestTemplate, CapturedOutput or ApplicationEvents, and no web server port.`;

const SPRING_BOOT_TEST = 'org.springframework.boot.test.context';
const MOCK_BEANS = new Set([
  'MockBean',
  'MockBeans',
  'SpyBean',
  'SpyBeans',
  'MockitoBean',
  'MockitoBeans',
  'MockitoSpyBean',
  'MockitoSpyBeans',
  'MockkBean',
  'SpykBean',
]);
const INJECTION = new Set([
  'Autowired',
  'Value',
  'Qualifier',
  'Inject',
  'Resource',
  'PersistenceContext',
  'MockBean',
  'SpyBean',
  'MockitoBean',
  'MockitoSpyBean',
  'TestBean',
  'LocalServerPort',
  'LocalManagementPort',
  'MockkBean',
  'SpykBean',
]);
const CLIENTS = new Set([
  'MockMvc',
  'MockMvcTester',
  'WebTestClient',
  'TestRestTemplate',
  'ApplicationContext',
  'CapturedOutput',
  'ApplicationEvents',
]);
const TEST_METHODS = new Set(['Test', 'ParameterizedTest', 'RepeatedTest']);
const RANDOM_PORT = /(?:^|\.)(?:RANDOM_PORT|DEFINED_PORT)$/u;

function importsSpringBootTest(file) {
  return file.imports.some(
    ({ path, all }) =>
      path === `${SPRING_BOOT_TEST}.SpringBootTest` || (all && path === SPRING_BOOT_TEST),
  );
}

function hasInjectionAnnotation(annotations) {
  return annotations.some((name) => INJECTION.has(name));
}

function injectsInto(file, klass) {
  const classes = file.classes.filter(({ qualified }) => insideClass(qualified, klass.qualified));
  const functions = file.functions.filter(({ owner }) => insideClass(owner, klass.qualified));
  const parameters = [
    ...classes.flatMap(({ primaryParameters }) => primaryParameters),
    ...functions.flatMap(({ parameters: list }) => list),
  ];
  const properties = file.properties.filter(({ owner }) => insideClass(owner, klass.qualified));
  return (
    classes.some(({ primaryParameters }) => primaryParameters.length > 0) ||
    functions.some(
      (fn) =>
        (fn.name === '<init>' && fn.parameters.length > 0) ||
        hasInjectionAnnotation(fn.annotations),
    ) ||
    parameters.some(
      (parameter) =>
        hasInjectionAnnotation(parameter.annotations) ||
        CLIENTS.has(simpleTypeName(parameter.type)),
    ) ||
    properties.some(
      (property) =>
        property.lateinit ||
        hasInjectionAnnotation(property.annotations) ||
        CLIENTS.has(simpleTypeName(property.type)),
    )
  );
}

function hasTestBody(file, klass) {
  return file.functions.some(
    (fn) =>
      insideClass(fn.owner, klass.qualified) &&
      fn.annotations.some((name) => TEST_METHODS.has(name)) &&
      fn.hasBody &&
      !fn.emptyBody,
  );
}

function usesPort(annotation) {
  const environment = annotation.arguments?.find(({ name }) => name === 'webEnvironment');
  return RANDOM_PORT.test(environment?.text ?? '');
}

function springTest(file, klass) {
  const annotation = klass.annotations.find(({ name }) => name === 'SpringBootTest');
  return (
    annotation !== undefined &&
    !klass.superCall &&
    !usesPort(annotation) &&
    !klass.annotations.some(({ name }) => MOCK_BEANS.has(name)) &&
    importsSpringBootTest(file)
  );
}

export function springContextFindings(files, { finding }) {
  return files
    .filter(({ test }) => test)
    .flatMap((file) =>
      file.classes
        .filter(
          (klass) =>
            springTest(file, klass) && !injectsInto(file, klass) && hasTestBody(file, klass),
        )
        .map((klass) =>
          finding({
            rule: SPRING_UNUSED_CONTEXT_RULE,
            file: file.file,
            line: klass.line,
            symbol: klass.qualified,
            message: MESSAGE,
            allowedForm: ALLOWED_FORM,
          }),
        ),
    );
}
