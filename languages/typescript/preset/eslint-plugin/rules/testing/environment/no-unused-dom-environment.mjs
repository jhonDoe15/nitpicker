import path from 'node:path';
import { readLayout } from '../../../../head-policy.mjs';
import { scanDomEvidence } from './dom-evidence.mjs';
import { closureUsesDom, setupUsesDom } from './module-closure.mjs';
import { RUNNER_OPTION_PROPERTY, vocabularyOf } from '../runners/runner-option.mjs';
import { statementSources } from '../../../../modules/module-sources.mjs';
import { registeredEnvironment } from '../../../../test-environment/global-dom/global-dom.mjs';

const layout = readLayout();
const DOM_ENVIRONMENTS = new Set(['jsdom', 'happy-dom']);
const ENVIRONMENT_DIRECTIVE = /@(vitest|jest)-environment\s+([\w-]+)\b/u;
const RUNNERS_WITHOUT_DIRECTIVES = new Set(['mocha', 'node']);
const GLOBAL_DOM_SETUP = {
  mocha: {
    setupPlace: 'the Mocha `require` setup (.mocharc or the test script)',
    separateRun: 'a separate Mocha run',
  },
  node: {
    setupPlace: 'the `--import` or `--require` flags of the `node --test` script',
    separateRun: 'a separate `node --test` run',
  },
};
const DEFAULT_GLOBAL_DOM_SETUP = {
  setupPlace: 'the test setup',
  separateRun: 'a separate test run',
};
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

function registeredInFile(program) {
  for (const statement of program.body) {
    const specifier = statementSources(statement).find((source) => registeredEnvironment(source));
    if (specifier !== undefined) {
      return { directive: specifier, name: registeredEnvironment(specifier), loc: statement.loc };
    }
  }
  return undefined;
}

function declaredEnvironment(sourceCode, runner) {
  const match = RUNNERS_WITHOUT_DIRECTIVES.has(runner)
    ? undefined
    : (ENVIRONMENT_DIRECTIVE.exec(sourceCode.text) ?? undefined);
  if (match === undefined) {
    return registeredInFile(sourceCode.ast);
  }
  const comment = sourceCode
    .getAllComments()
    .find((candidate) => candidate.range[0] <= match.index && match.index < candidate.range[1]);
  return {
    directive: `@${match[1]}-environment`,
    name: match[2],
    loc: comment?.loc,
    isDirective: true,
  };
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

function projectReport(options, directive) {
  const environment = options?.environment;
  return options?.globalDom === undefined
    ? { messageId: 'unusedProjectEnvironment', data: { environment, directive } }
    : {
        messageId: 'unusedGlobalDom',
        data: {
          environment,
          setup: options.globalDom,
          ...(GLOBAL_DOM_SETUP[options.runner] ?? DEFAULT_GLOBAL_DOM_SETUP),
        },
      };
}

function declaredMessage(declared, projectEnvironment) {
  if (declared.isDirective !== true) {
    return 'unusedRegisteredEnvironment';
  }
  return DOM_ENVIRONMENTS.has(projectEnvironment)
    ? 'unusedDirectiveOverDomProject'
    : 'unusedDirectiveEnvironment';
}

function reportFor(declared, options, directive) {
  if (declared === undefined) {
    return projectReport(options, directive);
  }
  return {
    messageId: declaredMessage(declared, options?.environment),
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
          globalDom: { type: 'string' },
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
      unusedGlobalDom: `This test file runs with {{environment}}, which {{setupPlace}} registers for every test file through \`{{setup}}\`, but never uses the DOM. Remove \`{{setup}}\` from {{setupPlace}}, then import it at the top of the test files that use the DOM, or move those files to {{separateRun}} that registers it. ${EXCEPTION_HINT}`,
      unusedRegisteredEnvironment: `This test file registers {{environment}} by importing \`{{directive}}\` but never uses the DOM. Remove the import. ${EXCEPTION_HINT}`,
    },
  },
  create(context) {
    const filename = context.filename;
    if (!layout.isRunnableTestFile(projectRelative(filename, context.cwd))) return {};
    const sourceCode = context.sourceCode;
    return {
      'Program:exit'(program) {
        const options = context.options[0];
        const declared = declaredEnvironment(sourceCode, options?.runner);
        const environment = declared?.name ?? options?.environment;
        if (!DOM_ENVIRONMENTS.has(environment)) return;
        const aliases = bundlerAliases(options);
        if (mayUseDom(filename, sourceCode.text, aliases)) return;
        if (projectSetupUsesDom(options, context.cwd, aliases)) return;
        const { environmentDirective } = vocabularyOf(context);
        context.report({
          node: program,
          ...reportFor(declared, options, environmentDirective),
        });
      },
    };
  },
};
