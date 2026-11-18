import type { TSESLint } from '@typescript-eslint/utils';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  FILE_NAME_CASINGS,
  fileNameComplies as untypedFileNameComplies,
  fileNameParts as untypedFileNameParts,
  folderCasing as untypedFolderCasing,
} from '../../../../conventions/file-name-casing.mjs';
import { readLayout } from '../typed/policy-views.mts';

type Options = readonly [Readonly<Record<string, unknown>>?];
type FileContext = { readonly cwd: string; readonly filename: string };

const fileNameComplies: (file: string, casing: string, text: string) => boolean =
  untypedFileNameComplies;
const fileNameParts: (file: string) => { readonly name: string } = untypedFileNameParts;
const folderCasing: (file: string, siblingNames: readonly string[]) => string | undefined =
  untypedFolderCasing;

const PIN_EXAMPLE = '"conventions": { "typescript.fileNames": "camelCase" }';

function siblingNames(filename: string): string[] {
  const directory = path.dirname(filename);
  return existsSync(directory) ? readdirSync(directory) : [];
}

function projectFile(context: FileContext): string {
  const relative = path.relative(context.cwd, context.filename);
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return (inside ? relative : fileNameParts(context.filename).name).replaceAll('\\', '/');
}

export const rule: TSESLint.RuleModule<'casing' | 'folderCasing', Options> = {
  meta: {
    type: 'suggestion',
    docs: {
      description: "Name files in the one casing the project's files already use",
    },
    schema: [
      {
        type: 'object',
        properties: {
          casing: { type: 'string', enum: FILE_NAME_CASINGS },
          pinned: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      casing: `File name "{{name}}" is not {{casing}}, which this project uses for file names. Rename it, pin a different casing with ${PIN_EXAMPLE} in nitpicker.config.json. An exception fits only when the name is deliberate.`,
      folderCasing:
        'File name "{{name}}" is not {{casing}}, which most other files in this folder use. Rename it. An exception fits only when the name is deliberate.',
    },
  },
  create(context) {
    const option = context.options[0];
    const casingOption = option?.['casing'];
    const projectCasing = typeof casingOption === 'string' ? casingOption : 'kebab-case';
    const layout = readLayout();
    return {
      Program() {
        const file = projectFile(context);
        const directory = path.posix.dirname(file);
        const siblings = siblingNames(context.filename).filter(
          (name) => !layout.isGeneratedPath(path.posix.join(directory, name)),
        );
        const folder = option?.['pinned'] === true ? undefined : folderCasing(file, siblings);
        const casing = folder ?? projectCasing;
        if (!(
          layout.isGeneratedPath(file) || fileNameComplies(file, casing, context.sourceCode.text)
        )) {
          context.report({
            loc: { line: 1, column: 0 },
            messageId: folder === undefined ? 'casing' : 'folderCasing',
            data: { name: fileNameParts(file).name, casing },
          });
        }
      },
    };
  },
};
