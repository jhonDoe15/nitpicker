import path from 'node:path';
import type * as Prettier from 'prettier';
import { textsOf } from '../../../../shared/values/readers.mts';
import {
  followedPrettierOptions as untypedFollowedPrettierOptions,
  prettierConventionOptions as untypedPrettierConventionOptions,
} from '../../conventions/prettier-conventions.mjs';
import {
  dataConventionOptions,
  dataFileKind,
} from '../../conventions/measures/data-conventions.mts';
import { readHeadPolicy as untypedReadHeadPolicy } from '../../preset/head-policy.mjs';

type Conventions = Readonly<Record<string, string>>;
type LayerSettings = {
  readonly precedence: unknown;
  readonly policyOptions: object;
  readonly liveProjectRoot: string;
  readonly relativePath: string;
};
type IgnoreSettings = {
  readonly precedence: unknown;
  readonly policyIgnorePath: string | undefined;
  readonly projectRoot: string;
  readonly liveProjectRoot: string;
  readonly relativePath: string;
};

const followedPrettierOptions: (conventions: Conventions) => Prettier.Options =
  untypedFollowedPrettierOptions;
const prettierConventionOptions: (conventions: Conventions) => Prettier.Options =
  untypedPrettierConventionOptions;
const readHeadPolicy: () => { readonly conventions: Conventions } = untypedReadHeadPolicy;

const CODE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

export async function layeredPrettierOptions(
  prettier: typeof Prettier,
  settings: LayerSettings,
): Promise<Prettier.Options> {
  const layers = await Promise.all(
    withDetectedBase(settings.precedence).map((layer) => layerOptions(prettier, settings, layer)),
  );
  return Object.fromEntries(layers.toReversed().flatMap((layer) => Object.entries(layer)));
}

function withDetectedBase(value: unknown): string[] {
  const precedence = textsOf(value);
  return precedence.includes('nitpicker') ? precedence : [...precedence, 'detected'];
}

async function layerOptions(
  prettier: typeof Prettier,
  settings: LayerSettings,
  layer: string,
): Promise<Prettier.Options> {
  const { policyOptions, liveProjectRoot, relativePath } = settings;
  if (layer === 'nitpicker') {
    return { ...policyOptions, ...conventionOptions(relativePath, { followed: false }) };
  }
  if (layer === 'detected') {
    return conventionOptions(relativePath, { followed: true });
  }
  return (
    (await prettier.resolveConfig(path.join(liveProjectRoot, relativePath), {
      editorconfig: true,
    })) ?? {}
  );
}

function conventionOptions(
  relativePath: string,
  { followed }: { readonly followed: boolean },
): Prettier.Options {
  const { conventions } = readHeadPolicy();
  if (CODE_FILE.test(relativePath)) {
    return followed ? followedPrettierOptions(conventions) : prettierConventionOptions(conventions);
  }
  const kind = dataFileKind(relativePath);
  return kind === undefined ? {} : dataConventionOptions(kind, conventions, { followed });
}

export async function isIgnoredByLayers(
  prettier: typeof Prettier,
  { precedence, policyIgnorePath, projectRoot, liveProjectRoot, relativePath }: IgnoreSettings,
): Promise<boolean> {
  const policyInfo = await prettier.getFileInfo(path.join(projectRoot, relativePath), {
    ...(policyIgnorePath === undefined ? {} : { ignorePath: policyIgnorePath }),
  });
  if (policyInfo.ignored || policyInfo.inferredParser === null) {
    return true;
  }
  if (!textsOf(precedence).includes('project')) {
    return false;
  }
  const projectInfo = await prettier.getFileInfo(path.join(liveProjectRoot, relativePath), {
    ignorePath: path.join(liveProjectRoot, '.prettierignore'),
  });
  return projectInfo.ignored;
}
