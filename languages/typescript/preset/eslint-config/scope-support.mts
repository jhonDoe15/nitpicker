import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import path from 'node:path';
import { readTextIfExists as untypedReadTextIfExists } from '../../../../shared/filesystem.mjs';
import { fieldOf, fieldsOf, textOf } from '../../../../shared/values/readers.mts';
import type { ResolvedLayout } from '../typed/layout-types.mts';
import { pathToFileURL } from 'node:url';
import { codeExtensions } from '../layout.mts';
import { readJsonc } from '../modules/tsconfig-files.mts';
import { projectConfigFile } from '../test-environment/config-files.mts';
import { nestEntryPoints } from './nest/nest-project.mts';
import { startedFiles } from './started-files/started-files.mts';

const REACT_PACKAGE = 'react';
type Scope = 'react' | 'i18n' | 'icons';
type Manifest = Readonly<Record<string, unknown>>;
type FrameworkConventions = { defaultExports: string[]; entryPoints: string[] };

const readTextIfExists: (file: string) => string = untypedReadTextIfExists;

const scopePackages: Readonly<Record<Scope, readonly string[]>> = {
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
  'forbidden',
  'unauthorized',
  'sitemap',
  'robots',
  'manifest',
  'icon',
  'apple-icon',
  'opengraph-image',
  'twitter-image',
];
const nextConventionGlobs = [
  `{app,src/app}/**/{${nextRouteFiles.join(',')}}.${codeExtensions}`,
  `{pages,src/pages}/**/*.${codeExtensions}`,
  `{middleware,src/middleware,proxy,src/proxy}.${codeExtensions}`,
];
const reactRouterGlobs = [
  `app/{root,routes,entry.client,entry.server}.${codeExtensions}`,
  `app/routes/**/*.${codeExtensions}`,
];
const reactRouterPackage = /^(?:@react-router\/dev|@remix-run\/.+)$/u;
const expoRouterGlobs = [`{app,src/app}/**/*.${codeExtensions}`];
const moduleScript = /<script\b([^>]*)>/giu;
const moduleType = /\btype\s*=\s*["']module["']/iu;
const scriptSource = /\bsrc\s*=\s*["']([^"']+)["']/iu;
const conventionalViteEntries = ['tsx', 'ts', 'jsx', 'js'].map((extension) => `main.${extension}`);

export function isStorybookPackage(name: string): boolean {
  return storybookPackage.test(name);
}

function directoryEntries(directory: string): Set<string> {
  return new Set(existsSync(directory) ? readdirSync(directory) : []);
}

function hasConfigFile(entries: ReadonlySet<string>, stem: string): boolean {
  return configExtensions.some((extension) => entries.has(`${stem}.${extension}`));
}

function indexHtmlEntries(projectRoot: string): string[] {
  return [...readTextIfExists(path.join(projectRoot, 'index.html')).matchAll(moduleScript)]
    .map(([, attributes = '']) =>
      moduleType.test(attributes) ? scriptSource.exec(attributes)?.[1] : undefined,
    )
    .flatMap((source) =>
      source === undefined || /^[a-z]+:/iu.test(source)
        ? []
        : [path.posix.normalize(source.replace(/^\/+/u, '')).split('?')[0] ?? ''],
    );
}

function viteEntryPoints(projectRoot: string): string[] {
  const declared = indexHtmlEntries(projectRoot);
  if (declared.length > 0) {
    return declared;
  }
  const sourceEntries = directoryEntries(path.join(projectRoot, 'src'));
  const conventional = conventionalViteEntries.find((file) => sourceEntries.has(file));
  return conventional === undefined ? [] : [`src/${conventional}`];
}

export function frameworkConventions(projectRoot: string): FrameworkConventions {
  const names = readDependencyNames(projectRoot);
  const entries = directoryEntries(projectRoot);
  const next = names.includes('next') || hasConfigFile(entries, 'next.config');
  const storybook = names.some(isStorybookPackage) || entries.has('.storybook');
  const vite = names.includes('vite') || hasConfigFile(entries, 'vite.config');
  const reactRouter =
    names.some((name) => reactRouterPackage.test(name)) ||
    hasConfigFile(entries, 'react-router.config');
  const started = startedFiles(projectRoot);
  return {
    defaultExports: [
      ...started.defaultExports,
      ...(next ? nextConventionGlobs : []),
      ...(storybook ? storyGlobs : []),
      ...(names.includes('expo-router') ? expoRouterGlobs : []),
      ...(reactRouter ? reactRouterGlobs : []),
    ],
    entryPoints: [
      ...new Set([
        ...(vite ? viteEntryPoints(projectRoot) : []),
        ...nestEntryPoints(projectRoot),
        ...started.entryPoints,
      ]),
    ],
  };
}

export function readManifest(projectRoot: string): Manifest {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
    );
    return fieldsOf(parsed);
  } catch {
    return {};
  }
}

export function readDependencyNames(projectRoot: string): string[] {
  const manifest = readManifest(projectRoot);
  return [
    ...Object.keys(fieldsOf(manifest['dependencies'])),
    ...Object.keys(fieldsOf(manifest['devDependencies'])),
  ];
}

const vitestGlobals = /\bglobals\s*:\s*true\b/u;

function vitestCleansUp(projectRoot: string): boolean {
  if (!readDependencyNames(projectRoot).includes('vitest')) {
    return true;
  }
  const configFile = projectConfigFile(projectRoot);
  return configFile !== undefined && vitestGlobals.test(readTextIfExists(configFile));
}

const AUTO_CLEANUP: Readonly<Record<string, (projectRoot: string) => boolean>> = {
  vitest: vitestCleansUp,
  jest: () => true,
  mocha: () => true,
  node: () => false,
};

export function testsCleanUpAutomatically(projectRoot: string, runner: string = 'vitest'): boolean {
  return (AUTO_CLEANUP[runner] ?? vitestCleansUp)(projectRoot);
}

export function isReactNativePackage(name: string): boolean {
  return name === 'react-native' || name === 'expo';
}

export function isScopePackage(scope: Scope, name: string): boolean {
  return scopePackages[scope].includes(name);
}

export function scopePackage(projectRoot: string, scope: Scope): string | undefined {
  return readDependencyNames(projectRoot).find((name) => scopePackages[scope].includes(name));
}

export function hasScopePackage(projectRoot: string, scope: Scope): boolean {
  return scopePackage(projectRoot, scope) !== undefined;
}

function installedManifest(projectRoot: string, name: string): unknown {
  try {
    const file = findPackageJSON(name, pathToFileURL(path.join(projectRoot, 'package.json')).href);
    return file === undefined ? undefined : readJsonc(file);
  } catch (error) {
    return { version: undefined, error };
  }
}

export function packageMajorOf(projectRoot: string, name: string): number | undefined {
  const installed = fieldOf(installedManifest(projectRoot, name), 'version');
  const manifest = readManifest(projectRoot);
  const declared =
    fieldsOf(manifest['dependencies'])[name] ?? fieldsOf(manifest['devDependencies'])[name];
  const major = /\d+/u.exec(typeof installed === 'string' ? installed : textOf(declared ?? ''));
  return major === null ? undefined : Number(major[0]);
}

export function reactMajorOf(projectRoot: string): number | undefined {
  return packageMajorOf(projectRoot, REACT_PACKAGE);
}

export function isReactProject({
  projectRoot,
  react = {},
}: {
  projectRoot: string;
  react?: Readonly<Record<string, unknown>>;
}): boolean {
  const enabled = react['enabled'];
  return typeof enabled === 'boolean' ? enabled : hasScopePackage(projectRoot, REACT_PACKAGE);
}

export function productionScope(
  layout: Pick<ResolvedLayout, 'sourceGlobs' | 'testGlobs' | 'sourceTestDirectoryGlobs'>,
): { files: string[]; ignores: string[] } {
  return {
    files: layout.sourceGlobs,
    ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
  };
}
