import { parsedTsconfig as untypedParsedTsconfig } from '../../../../preset/modules/tsconfig-files.mts';
import { hasProjectFile as untypedHasProjectFile } from '../../../../preset/test-runner/detection/project-files.mts';
import { compareText as untypedCompareText } from '../../../../../../shared/paths/path-order.mts';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../../shared/project-files/project-files.mts';

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
