import { readdirSync } from 'node:fs';
import { attempt } from '../project-tools/project-tool-layers.mjs';
import { readProjectFile, toml } from '../../libraries/project-files.mjs';
import { normalizeRequirementName } from '../../libraries/python-dependencies.mjs';

const ROOT_TOOL_FILES = new Set([
  'setup.py',
  'noxfile.py',
  'fabfile.py',
  'dodo.py',
  'pavement.py',
  'hatch_build.py',
  'build.py',
  'tasks.py',
]);
const TOOL_FILES = new Set(['conf.py']);
const COLLECTED_TEST = /^(?:test_.*|.*_test|conftest|tests)\.py$/u;
const TEST_DATA_FOLDERS = new Set([
  'fixtures',
  'fixture',
  'data',
  'testdata',
  'test_data',
  'outputs',
  'samples',
  'resources',
  'snapshots',
]);
const DECLARED_FORMS = ['*', '*-py', 'py*', 'py-*', 'python-*', '*-python'];
const DISTRIBUTION_PREFIXES = [
  [/^PIL$/u, ['pillow']],
  [/^cv2$/u, ['opencv-']],
  [/^sklearn$/u, ['scikit-learn']],
  [/^skimage$/u, ['scikit-image']],
  [/^git$/u, ['gitpython']],
  [/^yaml$/u, ['pyyaml']],
  [/^bs4$/u, ['beautifulsoup4']],
  [/^attr$/u, ['attrs']],
  [/^jwt$/u, ['pyjwt']],
  [/^Cryptodome$/u, ['pycryptodomex']],
  [/^Crypto$/u, ['pycryptodome', 'pycrypto']],
  [/^MySQLdb$/u, ['mysqlclient']],
  [/^psycopg2$/u, ['psycopg2-binary']],
  [/^fitz$/u, ['pymupdf']],
  [/^google$/u, ['protobuf', 'google-']],
  [/^gi$/u, ['pygobject']],
  [/^wx$/u, ['wxpython']],
  [/^pkg_resources$/u, ['setuptools']],
  [/^(?:win32\w*|pywintypes|pythoncom|_win32\w*)$/u, ['pywin32', 'pypiwin32']],
  [/^(?:AppKit|Foundation|objc|Quartz|Cocoa|CoreFoundation|PyObjCTools)$/u, ['pyobjc']],
];
const GENERATED_MODULE = /^(?:_version|__version__|version|.*_pb2(?:_grpc)?)$/u;
const COMPILED_BACKENDS =
  /^(?:meson-python|scikit-build|scikit-build-core|maturin|setuptools-rust|pybind11|nanobind|cython|cffi)$/u;
const COMPILED_BUILD_FILES = ['meson.build', 'CMakeLists.txt', 'Cargo.toml'];

export function isCheckedFile({ file, kind }) {
  const parts = file.split('/');
  const name = parts.at(-1);
  if (kind === 'test') {
    return (
      COLLECTED_TEST.test(name) && !parts.slice(0, -1).some((part) => TEST_DATA_FOLDERS.has(part))
    );
  }
  return !TOOL_FILES.has(name) && !(parts.length === 1 && ROOT_TOOL_FILES.has(name));
}

function buildRequirements(projectRoot) {
  const text = readProjectFile(projectRoot, 'pyproject.toml');
  const parsed = text === undefined ? {} : (attempt(() => toml().parse(text)).value ?? {});
  return (parsed['build-system']?.requires ?? [])
    .map((requirement) => /^[A-Za-z0-9][A-Za-z0-9._-]*/u.exec(String(requirement))?.[0])
    .filter((name) => name !== undefined)
    .map((name) => normalizeRequirementName(name));
}

export function declaredNames(projectRoot, declared) {
  return new Set([
    ...declared.dependencies.map(({ normalized }) => normalized),
    ...buildRequirements(projectRoot),
  ]);
}

export function isDeclared(names, top) {
  const name = normalizeRequirementName(top);
  if (DECLARED_FORMS.some((form) => names.has(form.replace('*', name)))) {
    return true;
  }
  const prefixes = DISTRIBUTION_PREFIXES.filter(([pattern]) => pattern.test(top)).flatMap(
    ([, listed]) => listed,
  );
  return [...names].some(
    (declaredName) =>
      prefixes.some((prefix) => declaredName.startsWith(prefix)) ||
      declaredName.split('-').includes(name),
  );
}

export function isGeneratedModule(name) {
  return GENERATED_MODULE.test(name);
}

export function buildsExtensions(projectRoot) {
  const rootFiles = new Set(readdirSync(projectRoot));
  return (
    buildRequirements(projectRoot).some((name) => COMPILED_BACKENDS.test(name)) ||
    COMPILED_BUILD_FILES.some((file) => rootFiles.has(file))
  );
}
