import {
  ignoredConfigNotice,
  precedenceLayers,
} from '../../../../shared/conventions/tool-precedence.mts';
import type { NitpickerConfig } from '../../../../shared/values/config-types.mts';
import { projectEslintConfig } from './project-config.mts';

type StyleInput = { readonly config: NitpickerConfig; readonly projectRoot?: string | undefined };
type EslintStyle = {
  readonly unused: Readonly<Record<string, never>>;
  readonly project: Readonly<Record<string, never>>;
  readonly note: () => undefined;
  readonly summary: () => string[];
};

function ignoredEslintConfigNotices({ config, projectRoot }: StyleInput): string[] {
  const settings = config.tools?.['eslint'];
  if (projectRoot === undefined || precedenceLayers(settings?.precedence).usesProject) {
    return [];
  }
  const file = projectEslintConfig(projectRoot);
  return file === undefined ? [] : [ignoredConfigNotice(file, 'eslint', settings)];
}

export function eslintConfigStyle(context: StyleInput): EslintStyle {
  return {
    unused: {},
    project: {},
    note: () => undefined,
    summary: () => ignoredEslintConfigNotices(context),
  };
}
