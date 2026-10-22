const CLASS_NAME =
  /^\[IdentifierName\] Classes should be named in UpperCamelCase\b[^\n]*?did you mean '(\w+)'\?/u;
const INTEGRATION_TEST = /^(?:It[A-Z]\w*|\w*[a-z0-9](?:It|ItCase))$/u;

export function isIntegrationTestName(diagnostic) {
  const suggested =
    typeof diagnostic.message === 'string' ? CLASS_NAME.exec(diagnostic.message)?.[1] : undefined;
  return suggested !== undefined && INTEGRATION_TEST.test(suggested);
}
