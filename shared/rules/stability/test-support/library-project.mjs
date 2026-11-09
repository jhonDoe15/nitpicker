const LIBRARY_FEATURES = ['catalog', 'loans', 'members'];

function featureUses(name, { adaptersImplementFace }) {
  return [
    [`${name}:face`, `${name}:domain`],
    [`${name}:face`, `${name}:adapters`],
    [`${name}:adapters`, `${name}:domain`],
    [`${name}:adapters`, 'shared'],
    [`${name}:domain`, 'shared'],
    ...(adaptersImplementFace ? [[`${name}:adapters`, `${name}:face`]] : []),
  ];
}

export function libraryProject({ withFines = false, adaptersImplementFace = false } = {}) {
  const features = withFines ? [...LIBRARY_FEATURES, 'fines'] : LIBRARY_FEATURES;
  const fines = withFines
    ? [
        ...LIBRARY_FEATURES.map((name) => ['fines:adapters', `${name}:face`]),
        ['fines:domain', 'members:face'],
      ]
    : [];
  return {
    features,
    uses: [
      ...features.map((name) => ['main', `${name}:face`]),
      ...features.flatMap((name) => featureUses(name, { adaptersImplementFace })),
      ...fines,
    ],
  };
}

export function partsOf(reference) {
  const [feature, part] = reference.split(':');
  return part === undefined ? { part: feature } : { feature, part };
}

const PART_FILES = { face: 'api', domain: 'domain/model', adapters: 'adapters/store' };
const ROOT_FILES = { shared: 'src/shared/ids.x', main: 'src/main.x' };

export function libraryFile(reference) {
  const { feature, part } = partsOf(reference);
  return feature === undefined ? ROOT_FILES[part] : `src/features/${feature}/${PART_FILES[part]}.x`;
}

export function libraryGraph(uses) {
  const edges = uses.map(([source, target]) => ({
    source: libraryFile(source),
    target: libraryFile(target),
    kind: 'runtime',
  }));
  return {
    modules: [...new Set(edges.flatMap(({ source, target }) => [source, target]))].sort(),
    edges,
    packageOf: (file) => file.slice(0, file.lastIndexOf('/')),
  };
}
