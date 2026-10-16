import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { codeExtensions } from '../layout.mjs';
import { readJsonc } from '../modules/tsconfig-files.mjs';

const scopePackages = {
  react: ['react'],
  i18n: ['react-intl', '@formatjs/intl'],
  icons: [
    'lucide-react',
    'react-icons',
    '@heroicons/react',
    '@mui/icons-material',
    '@tabler/icons-react',
    '@phosphor-icons/react',
    'phosphor-react',
    '@radix-ui/react-icons',
    '@fortawesome/react-fontawesome',
    '@fortawesome/free-solid-svg-icons',
    '@iconify/react',
    'react-feather',
    '@ant-design/icons',
    '@chakra-ui/icons',
    '@primer/octicons-react',
    '@carbon/icons-react',
    '@fluentui/react-icons',
    '@remixicon/react',
    '@mdi/js',
    '@mdi/react',
    '@expo/vector-icons',
    'react-native-vector-icons',
  ],
};

export const storySuffixes = ['stories', 'story'];
export const storyGlobs = [`**/*.{${storySuffixes.join(',')}}.${codeExtensions}`];

const storybookPackage = /^(?:storybook|@storybook\/.+)$/u;
const configExtensions = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts'];
const nextRouteFiles = [
  'page',
  'layout',
  'loading',
  'error',
  'global-error',
  'not-found',
  'template',
  'default',
  'route',
];
const nextConventionGlobs = [
  `{app,src/app}/**/{${nextRouteFiles.join(',')}}.${codeExtensions}`,
  `{pages,src/pages}/**/*.${codeExtensions}`,
  `{middleware,src/middleware}.${codeExtensions}`,
];
const expoRouterGlobs = [`{app,src/app}/**/*.${codeExtensions}`];
const moduleScript = /<script\b([^>]*)>/giu;
const moduleType = /\btype\s*=\s*["']module["']/iu;
const scriptSource = /\bsrc\s*=\s*["']([^"']+)["']/iu;
const conventionalViteEntries = ['tsx', 'ts', 'jsx', 'js'].map(
  (extension) => `src/main.${extension}`,
);

export function isStorybookPackage(name) {
  return storybookPackage.test(name);
}

function hasConfigFile(projectRoot, stem) {
  return configExtensions.some((extension) =>
    existsSync(path.join(projectRoot, `${stem}.${extension}`)),
  );
}

function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

function indexHtmlEntries(projectRoot) {
  return [...readText(path.join(projectRoot, 'index.html')).matchAll(moduleScript)]
    .map(([, attributes]) =>
      moduleType.test(attributes) ? scriptSource.exec(attributes)?.[1] : undefined,
    )
    .filter((source) => source !== undefined && !/^[a-z]+:/iu.test(source))
    .map((source) => path.posix.normalize(source.replace(/^\/+/u, '')).split('?')[0]);
}

function viteEntryPoints(projectRoot) {
  const declared = indexHtmlEntries(projectRoot);
  if (declared.length > 0) {
    return declared;
  }
  const conventional = conventionalViteEntries.find((file) =>
    existsSync(path.join(projectRoot, file)),
  );
  return conventional === undefined ? [] : [conventional];
}

export function frameworkConventions(projectRoot) {
  const names = readDependencyNames(projectRoot);
  const next = names.includes('next') || hasConfigFile(projectRoot, 'next.config');
  const storybook =
    names.some(isStorybookPackage) || existsSync(path.join(projectRoot, '.storybook'));
  const vite = names.includes('vite') || hasConfigFile(projectRoot, 'vite.config');
  return {
    defaultExports: [
      ...(next ? nextConventionGlobs : []),
      ...(storybook ? storyGlobs : []),
      ...(names.includes('expo-router') ? expoRouterGlobs : []),
    ],
    entryPoints: vite ? viteEntryPoints(projectRoot) : [],
  };
}

export function readManifest(projectRoot) {
  try {
    return JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function readDependencyNames(projectRoot) {
  const manifest = readManifest(projectRoot);
  return [
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
  ];
}

export function isReactNativePackage(name) {
  return name === 'react-native' || name === 'expo';
}

export function isScopePackage(scope, name) {
  return scopePackages[scope].includes(name);
}

export function scopePackage(projectRoot, scope) {
  return readDependencyNames(projectRoot).find((name) => scopePackages[scope].includes(name));
}

export function hasScopePackage(projectRoot, scope) {
  return scopePackage(projectRoot, scope) !== undefined;
}

export function reactMajorOf(projectRoot) {
  const installed = readJsonc(path.join(projectRoot, 'node_modules/react/package.json'))?.version;
  const manifest = readManifest(projectRoot);
  const declared = manifest?.dependencies?.react ?? manifest?.devDependencies?.react;
  const major = /\d+/u.exec(typeof installed === 'string' ? installed : String(declared ?? ''));
  return major === null ? undefined : Number(major[0]);
}

export function isReactProject({ projectRoot, react = {} }) {
  return react.enabled ?? hasScopePackage(projectRoot, 'react');
}

export function productionScope(layout) {
  return {
    files: layout.sourceGlobs,
    ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
  };
}
