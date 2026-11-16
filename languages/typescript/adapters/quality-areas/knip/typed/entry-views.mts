import { parsedTsconfig as untypedParsedTsconfig } from '../../../../preset/modules/tsconfig-files.mjs';
import { hasProjectFile as untypedHasProjectFile } from '../../../../preset/test-runner/detect-runner.mjs';
import { compareText as untypedCompareText } from '../../../../../../shared/paths/path-order.mjs';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../../shared/project-files/project-files.mjs';

export const parsedTsconfig: (file: string) => {
  readonly options: {
    readonly rootDir?: string;
    readonly outDir?: string;
    readonly declarationDir?: string;
  };
} = untypedParsedTsconfig;

export const hasProjectFile: (projectRoot: string, name: string) => boolean = untypedHasProjectFile;

export const compareText: (left: string, right: string) => number = untypedCompareText;

export const projectFilesUnder: (
  root: string,
  options: {
    readonly includeIgnored: boolean;
    readonly skipDirectory: (absolute: string, entry: { readonly name: string }) => boolean;
  },
) => string[] = untypedProjectFilesUnder;
