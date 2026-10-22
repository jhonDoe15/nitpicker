import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  FILE_NAME_CASINGS,
  fileNameComplies,
  fileNameParts,
  folderCasing,
} from '../../../../conventions/file-name-casing.mjs';
import { readLayout } from '../../../head-policy.mjs';

const PIN_EXAMPLE = '"conventions": { "typescript.fileNames": "camelCase" }';

function siblingNames(filename) {
  const directory = path.dirname(filename);
  return existsSync(directory) ? readdirSync(directory) : [];
}

function projectFile(context) {
  const relative = path.relative(context.cwd ?? process.cwd(), context.filename);
  const inside = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
  return (inside ? relative : fileNameParts(context.filename).name).replaceAll('\\', '/');
}

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: "Name files in the one casing the project's files already use",
    },
    schema: [
      {
        type: 'object',
        properties: { casing: { enum: FILE_NAME_CASINGS }, pinned: { type: 'boolean' } },
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
    const projectCasing = context.options[0]?.casing ?? 'kebab-case';
    const layout = readLayout();
    return {
      Program() {
        const file = projectFile(context);
        const directory = path.posix.dirname(file);
        const siblings = siblingNames(context.filename).filter(
          (name) => !layout.isGeneratedPath(path.posix.join(directory, name)),
        );
        const folder = context.options[0]?.pinned ? undefined : folderCasing(file, siblings);
        const casing = folder ?? projectCasing;
        if (
          !layout.isGeneratedPath(file) &&
          !fileNameComplies(file, casing, context.sourceCode.text)
        ) {
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
