const ALLOWED_FOLDERS = new Set(['features', 'shared', 'composition-root']);
const REACT_UI_FOLDERS = new Set([
  'ui',
  'components',
  'pages',
  'app',
  'routes',
  'views',
  'layouts',
  'screens',
  'hooks',
  'styles',
  'assets',
]);
const FEATURE_FOLDERS = new Set(['domain', 'adapters']);
const REACT_FEATURE_FOLDER = 'ui';
const ROOT_FILE = /^(?:main|server|composition-root|index)\.[cm]?[jt]sx?$/;
const REACT_ROOT_FILE = /^App\.[jt]sx$/;
const FEATURE_INDEX = /^index\.[cm]?[jt]sx?$/;
const UI = ' (and ui/ for components in a React project)';

function escaped(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function mainFolderProblem({ folder, separator }, react) {
  if (separator === '/') {
    const allowed = ALLOWED_FOLDERS.has(folder) || (react && REACT_UI_FOLDERS.has(folder));
    return allowed ? undefined : 'unknownFolder';
  }
  const allowed = ROOT_FILE.test(folder) || (react && REACT_ROOT_FILE.test(folder));
  return allowed ? undefined : 'looseFile';
}

function featureProblem({ entry, separator }, react) {
  if (entry === undefined) {
    return undefined;
  }
  if (separator === '/') {
    const allowed = FEATURE_FOLDERS.has(entry) || (react && entry === REACT_FEATURE_FOLDER);
    return allowed ? undefined : 'unknownFeatureFolder';
  }
  return FEATURE_INDEX.test(entry) ? undefined : 'looseFeatureFile';
}

function placeOf(filename, roots) {
  const main = new RegExp(`(?:^|/)(?:${roots.map(escaped).join('|')})/main/([^/]+)(/?)(.*)$`);
  const [, folder, separator, rest] = main.exec(filename) ?? [];
  if (folder === undefined) {
    return undefined;
  }
  const [, entry, entrySeparator] =
    folder === 'features' ? (/^[^/]+\/([^/]+)(\/?)/.exec(rest) ?? []) : [];
  return { folder, separator, feature: { entry, separator: entrySeparator } };
}

function problemOf(place, react) {
  const atMain = mainFolderProblem(place, react);
  if (atMain !== undefined) {
    return { messageId: atMain, folder: place.folder };
  }
  const inFeature = place.folder === 'features' ? featureProblem(place.feature, react) : undefined;
  return inFeature === undefined
    ? undefined
    : { messageId: inFeature, folder: place.feature.entry };
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Allow only features, shared and the composition root under src/main' },
    schema: [
      {
        type: 'object',
        properties: {
          sourceRoots: { type: 'array', items: { type: 'string' } },
          react: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      looseFile:
        "'{{folder}}' sits directly in src/main/, which holds only features/, shared/ and the composition root (composition-root.ts, main.ts, server.ts) and index.ts. Move it into the feature that uses it, or into shared/ when several features need it. An exception fits only when the file is deliberate.",
      unknownFolder:
        "'{{folder}}/' is not a layer of this layout. Under src/main/ put code in features/<name>/ (domain/ for pure logic, adapters/ for I/O), in shared/ when several features need it, or in the composition root. An exception fits only when this folder is deliberate.",
      unknownFeatureFolder: `'{{folder}}/' is not a layer of a feature. A feature holds domain/ for pure logic and adapters/ for I/O${UI}, and its public index.ts. An exception fits only when this folder is deliberate.`,
      looseFeatureFile: `'{{folder}}' sits directly in a feature folder, which holds only its public index.ts besides domain/ and adapters/${UI}. Move it into domain/ if it is pure logic or adapters/ if it does I/O. An exception fits only when the file is deliberate.`,
    },
  },
  create(context) {
    const { sourceRoots = ['src'], react = false } = context.options[0] ?? {};
    const place = placeOf(context.filename.replaceAll('\\', '/'), sourceRoots);
    const problem = place === undefined ? undefined : problemOf(place, react);
    return {
      Program(node) {
        if (problem !== undefined) {
          context.report({ node, messageId: problem.messageId, data: { folder: problem.folder } });
        }
      },
    };
  },
};
