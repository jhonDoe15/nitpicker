const MANIFEST_NAMES = [
  String.raw`build\.gradle(?:\.kts)?`,
  String.raw`pom\.xml`,
  String.raw`package\.json`,
  'Makefile',
  'justfile',
  String.raw`pyproject\.toml`,
  String.raw`openapitools\.json`,
  String.raw`openapi-generator[\w.-]*`,
];
const MANIFEST = new RegExp(`(?:^|/)(?:${MANIFEST_NAMES.join('|')})$`, 'u');
const GENERATORS = [
  'openapi-generator',
  'openApiGenerate',
  String.raw`org\.openapitools`,
  'oapi-codegen',
  'datamodel-code-generator',
  'datamodel-codegen',
  'openapi-typescript',
  'openapi-python-client',
  'swagger-codegen',
  String.raw`\borval\b`,
  String.raw`go:generate[^\n]*ogen`,
];
const GENERATOR = new RegExp(GENERATORS.join('|'), 'u');
const GO_SOURCE = /\.go$/u;

export function usesGenerator(files, readText) {
  return files.some((file) => {
    if (!(MANIFEST.test(file) || GO_SOURCE.test(file))) {
      return false;
    }
    const text = readText(file);
    return text !== undefined && GENERATOR.test(text);
  });
}
