import {
  FILE_NAME_CASINGS,
  fileNameComplies,
  fileNameParts,
} from '../../../../conventions/file-name-casing.mjs';

const FIRST_LINE = { line: 1, column: 0 };

export const rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: "Name files in the one casing the project's files already use",
    },
    schema: [
      {
        type: 'object',
        properties: { casing: { enum: FILE_NAME_CASINGS } },
        additionalProperties: false,
      },
    ],
    messages: {
      casing:
        'File name "{{name}}" is not {{casing}}, which this project uses for file names. Rename it, pin a different casing with "conventions": { "typescript.fileNames": "camelCase" } in nitpicker.config.json, or add an "exceptions" entry for nitpicker/file-name-casing.',
    },
  },
  create(context) {
    const casing = context.options[0]?.casing ?? 'kebab-case';
    return {
      Program() {
        if (!fileNameComplies(context.filename, casing)) {
          context.report({
            loc: FIRST_LINE,
            messageId: 'casing',
            data: { name: fileNameParts(context.filename).name, casing },
          });
        }
      },
    };
  },
};
