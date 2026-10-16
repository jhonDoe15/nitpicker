import { readFileSync } from 'node:fs';
import path from 'node:path';
import { codeExtensions } from '../layout.mjs';

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

export function analyzedProjectRoot(environment = process.env) {
  return environment.NITPICKER_DIFF_ESLINT_PROJECT_ROOT ?? process.cwd();
}

export const storySuffixes = ['stories', 'story'];
export const storyGlobs = [`**/*.{${storySuffixes.join(',')}}.${codeExtensions}`];

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

export function isScopePackage(scope, name) {
  return scopePackages[scope].includes(name);
}

export function scopePackage(projectRoot, scope) {
  return readDependencyNames(projectRoot).find((name) => scopePackages[scope].includes(name));
}

export function hasScopePackage(projectRoot, scope) {
  return scopePackage(projectRoot, scope) !== undefined;
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
