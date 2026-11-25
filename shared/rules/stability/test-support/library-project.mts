import { byText } from '../../../text-order/by-text.mts';

const LIBRARY_FEATURES = ['catalog', 'loans', 'members'];

type Use = string[];

type LibraryOptions = {
  readonly withFines?: true | false;
  readonly adaptersImplementFace?: true | false;
};

function featureUses(
  name: string,
  { adaptersImplementFace }: { adaptersImplementFace: boolean },
): Use[] {
  return [
    [`${name}:face`, `${name}:domain`],
    [`${name}:face`, `${name}:adapters`],
    [`${name}:adapters`, `${name}:domain`],
    [`${name}:adapters`, 'shared'],
    [`${name}:domain`, 'shared'],
    ...(adaptersImplementFace ? [[`${name}:adapters`, `${name}:face`]] : []),
  ];
}

export function libraryProject({
  withFines = false,
  adaptersImplementFace = false,
}: LibraryOptions = {}): {
  readonly features: string[];
  readonly uses: Use[];
} {
  const features = withFines ? [...LIBRARY_FEATURES, 'fines'] : LIBRARY_FEATURES;
  const fines: Use[] = withFines
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

export function partsOf(reference: string): { readonly feature?: string; readonly part: string } {
  const separator = reference.indexOf(':');
  return separator < 0
    ? { part: reference }
    : { feature: reference.slice(0, separator), part: reference.slice(separator + 1) };
}

const PART_FILES: Readonly<Record<string, string>> = {
  face: 'api',
  domain: 'domain/model',
  adapters: 'adapters/store',
};
const ROOT_FILES: Readonly<Record<string, string>> = {
  shared: 'src/shared/ids.x',
  main: 'src/main.x',
};

export function libraryFile(reference: string): string {
  const { feature, part } = partsOf(reference);
  return feature === undefined
    ? (ROOT_FILES[part] ?? '')
    : `src/features/${feature}/${PART_FILES[part] ?? ''}.x`;
}

export function libraryGraph(uses: readonly Use[]): {
  readonly modules: string[];
  readonly edges: { readonly source: string; readonly target: string; readonly kind: string }[];
  readonly packageOf: (file: string) => string;
} {
  const edges = uses.map(([source = '', target = '']) => ({
    source: libraryFile(source),
    target: libraryFile(target),
    kind: 'runtime',
  }));
  return {
    modules: [...new Set(edges.flatMap(({ source, target }) => [source, target]))].sort(byText),
    edges,
    packageOf: (file) => file.slice(0, file.lastIndexOf('/')),
  };
}
