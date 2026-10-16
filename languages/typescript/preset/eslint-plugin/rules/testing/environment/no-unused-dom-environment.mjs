import path from 'node:path';
import { readLayout } from '../../../../head-policy.mjs';
import { scanDomEvidence } from './dom-evidence.mjs';
import { closureUsesDom, setupUsesDom } from './module-closure.mjs';
import { RUNNER_OPTION_PROPERTY, vocabularyOf } from '../runners/runner-option.mjs';

const layout = readLayout();
const DOM_ENVIRONMENTS = new Set(['jsdom', 'happy-dom']);
const ENVIRONMENT_DIRECTIVE = /@(vitest|jest)-environment\s+([\w-]+)\b/u;
const EXCEPTION_HINT =
  'If it uses the DOM in a way nitpicker cannot see, add an exception for nitpicker/no-unused-dom-environment.';
const ALIAS_FIND = {
  anyOf: [
    { type: 'string' },
    {
      type: 'object',
      properties: { pattern: { type: 'string' }, flags: { type: 'string' } },
      required: ['pattern'],
      additionalProperties: false,
    },
  ],
};

function projectRelative(filename, cwd) {
  const relative = path.relative(cwd, filename).split(path.sep).join('/');
  if (!relative.startsWith('..')) return relative;
  const roots = [...layout.sourceRoots, ...layout.testRoots];
  const root = roots.find((candidate) => filename.includes(`/${candidate}/`));
  return root === undefined ? relative : filename.slice(filename.indexOf(`/${root}/`) + 1);
}

function declaredEnvironment(sourceCode) {
  const match = ENVIRONMENT_DIRECTIVE.exec(sourceCode.text);
  if (match === null) return undefined;
  const comment = sourceCode
    .getAllComments()
    .find((candidate) => candidate.range[0] <= match.index && match.index < candidate.range[1]);
  return { directive: `@${match[1]}-environment`, name: match[2], loc: comment?.loc };
}

function bundlerAliases(options) {
  return (options?.aliases ?? []).map(({ find, replacement }) => ({
    find: typeof find === 'string' ? find : new RegExp(find.pattern, find.flags),
    replacement,
  }));
}

function mayUseDom(filename, text, aliases) {
  const evidence = scanDomEvidence(text, filename);
  return (
    evidence.usesDom ||
    evidence.opaqueImport ||
    closureUsesDom(filename, evidence.specifiers, aliases) !== false
  );
}

function projectSetupUsesDom(options, cwd, aliases) {
  return (
    DOM_ENVIRONMENTS.has(options?.environment) &&
    setupUsesDom(options?.setupFiles ?? [], cwd, aliases)
  );
}

function reportFor(declared, projectEnvironment, directive) {
  if (declared === undefined) {
    return {
      messageId: 'unusedProjectEnvironment',
      data: { environment: projectEnvironment, directive },
    };
  }
  return {
    messageId: DOM_ENVIRONMENTS.has(projectEnvironment)
      ? 'unusedDirectiveOverDomProject'
      : 'unusedDirectiveEnvironment',
    data: { environment: declared.name, directive: declared.directive },
    ...(declared.loc === undefined ? {} : { loc: declared.loc }),
  };
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          ...RUNNER_OPTION_PROPERTY,
          environment: { type: 'string' },
          setupFiles: { type: 'array', items: { type: 'string' } },
          aliases: {
            type: 'array',
            items: {
              type: 'object',
              properties: { find: ALIAS_FIND, replacement: { type: 'string' } },
              required: ['find', 'replacement'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unusedDirectiveEnvironment: `This test file declares {{environment}} but never uses the DOM. Change the directive to \`{{directive}} node\` or remove it. ${EXCEPTION_HINT}`,
      unusedDirectiveOverDomProject: `This test file declares {{environment}} but never uses the DOM, and the project default is a DOM environment too. Change the directive to \`{{directive}} node\`. ${EXCEPTION_HINT}`,
      unusedProjectEnvironment: `This test file runs in {{environment}}, the project default, but never uses the DOM. Add \`/** {{directive}} node */\` here, or default to node and add \`/** {{directive}} {{environment}} */\` to DOM tests. ${EXCEPTION_HINT}`,
    },
  },
  create(context) {
    const filename = context.filename;
    if (!layout.isRunnableTestFile(projectRelative(filename, context.cwd))) return {};
    const sourceCode = context.sourceCode;
    return {
      'Program:exit'(program) {
        const options = context.options[0];
        const declared = declaredEnvironment(sourceCode);
        const environment = declared?.name ?? options?.environment;
        if (!DOM_ENVIRONMENTS.has(environment)) return;
        const aliases = bundlerAliases(options);
        if (mayUseDom(filename, sourceCode.text, aliases)) return;
        if (projectSetupUsesDom(options, context.cwd, aliases)) return;
        const { environmentDirective } = vocabularyOf(context);
        context.report({
          node: program,
          ...reportFor(declared, options?.environment, environmentDirective),
        });
      },
    };
  },
};
