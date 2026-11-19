import type { JSONSchema, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { fixable } from '../../../fixes/support/descriptors.mts';
import { replacing } from '../../../fixes/support/ranges.mts';
import { readLayout } from '../../typed/policy-views.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { scanDomEvidence } from './dom-evidence.mts';
import { closureUsesDom, setupUsesDom, type ModuleAlias } from './module-closure.mts';
import {
  RUNNER_OPTION_PROPERTY,
  projectRelative,
  runnerOf,
} from '../../runner-apis/runner-option.mts';
import { statementSources as untypedStatementSources } from '../../../../modules/module-sources.mjs';
import { registeredEnvironment as untypedRegisteredEnvironment } from '../../../../test-environment/global-dom/global-dom.mjs';

type MessageId =
  | 'unusedDirectiveEnvironment'
  | 'unusedDirectiveOverDomProject'
  | 'unusedProjectEnvironment'
  | 'unusedGlobalDom'
  | 'unusedRegisteredEnvironment';
type AliasFind = string | { readonly pattern: string; readonly flags?: string };
type EnvironmentOptions = {
  readonly runner?: string;
  readonly environment?: string;
  readonly globalDom?: string;
  readonly setupFiles?: readonly string[];
  readonly aliases?: readonly { readonly find: AliasFind; readonly replacement: string }[];
};
type Options = readonly [EnvironmentOptions?];
type Declared = {
  readonly directive: string;
  readonly name: string;
  readonly loc: TSESTree.SourceLocation | undefined;
  readonly isDirective: boolean;
  readonly nameRange?: TSESTree.Range;
};
type GlobalDomSetup = { readonly setupPlace: string; readonly separateRun: string };
type Reported = {
  readonly messageId: MessageId;
  readonly data: Readonly<Record<string, string | undefined>>;
  readonly loc?: TSESTree.SourceLocation;
};

const layout = readLayout();
const DOM_ENVIRONMENTS = new Set(['jsdom', 'happy-dom']);
const ENVIRONMENT_DIRECTIVE = /@(vitest|jest)-environment\s+([\w-]+)\b/u;
const RUNNER_DIRECTIVES: Readonly<Record<string, string>> = {
  vitest: '@vitest-environment',
  jest: '@jest-environment',
};
const GLOBAL_REGISTRARS: Readonly<Record<string, string>> = {
  jsdom: 'global-jsdom/register',
  'happy-dom': '@happy-dom/global-registrator',
};
const GLOBAL_DOM_SETUP: Readonly<Record<string, GlobalDomSetup>> = {
  mocha: {
    setupPlace: 'the Mocha `require` setup (.mocharc or the test script)',
    separateRun: 'a separate Mocha run',
  },
  node: {
    setupPlace: 'the `--import` or `--require` flags of the `node --test` script',
    separateRun: 'a separate `node --test` run',
  },
};
const DEFAULT_GLOBAL_DOM_SETUP: GlobalDomSetup = {
  setupPlace: 'the test setup',
  separateRun: 'a separate test run',
};
const statementSources: (statement: TSESTree.Node) => string[] = untypedStatementSources;
const registeredRegistrar: (specifier: string) => unknown = untypedRegisteredEnvironment;

function registeredEnvironment(specifier: string): string | undefined {
  const name = registeredRegistrar(specifier);
  return typeof name === 'string' ? name : undefined;
}
const EXCEPTION_HINT =
  'An exception fits only when the file uses the DOM in a way nitpicker cannot see.';
const ALIAS_FIND: JSONSchema.JSONSchema4 = {
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

function isDomEnvironment(name: string | undefined): boolean {
  return name !== undefined && DOM_ENVIRONMENTS.has(name);
}

function registeredInFile(program: TSESTree.Program): Declared | undefined {
  for (const statement of program.body) {
    const specifier = statementSources(statement).find(
      (source) => registeredEnvironment(source) !== undefined,
    );
    const name = specifier === undefined ? undefined : registeredEnvironment(specifier);
    if (specifier !== undefined && name !== undefined) {
      return { directive: specifier, name, loc: statement.loc, isDirective: false };
    }
  }
  return undefined;
}

function declaredEnvironment(sourceCode: SourceCode, runner: string): Declared | undefined {
  const match =
    RUNNER_DIRECTIVES[runner] === undefined
      ? undefined
      : (ENVIRONMENT_DIRECTIVE.exec(sourceCode.text) ?? undefined);
  const [, tool, name] = match ?? [];
  if (match === undefined || tool === undefined || name === undefined) {
    return registeredInFile(sourceCode.ast);
  }
  const comment = sourceCode
    .getAllComments()
    .find((candidate) => candidate.range[0] <= match.index && match.index < candidate.range[1]);
  const nameEnd = match.index + match[0].length;
  return {
    directive: `@${tool}-environment`,
    name,
    loc: comment?.loc,
    isDirective: true,
    nameRange: [nameEnd - name.length, nameEnd],
  };
}

function bundlerAliases(options: EnvironmentOptions | undefined): ModuleAlias[] {
  return (options?.aliases ?? []).map(({ find, replacement }) => ({
    find: typeof find === 'string' ? find : new RegExp(find.pattern, find.flags),
    replacement,
  }));
}

function mayUseDom(filename: string, text: string, aliases: readonly ModuleAlias[]): boolean {
  const evidence = scanDomEvidence(text, filename);
  return (
    evidence.usesDom ||
    evidence.opaqueImport ||
    closureUsesDom(filename, evidence.specifiers, aliases) !== false
  );
}

function projectSetupUsesDom(
  options: EnvironmentOptions | undefined,
  cwd: string,
  aliases: readonly ModuleAlias[],
): boolean {
  return (
    isDomEnvironment(options?.environment) && setupUsesDom(options?.setupFiles ?? [], cwd, aliases)
  );
}

function projectReport(options: EnvironmentOptions | undefined, runner: string): Reported {
  const environment = options?.environment;
  const directive = RUNNER_DIRECTIVES[runner];
  if (options?.globalDom === undefined && directive !== undefined) {
    return { messageId: 'unusedProjectEnvironment', data: { environment, directive } };
  }
  return {
    messageId: 'unusedGlobalDom',
    data: {
      environment,
      setup: options?.globalDom ?? GLOBAL_REGISTRARS[environment ?? ''],
      ...(GLOBAL_DOM_SETUP[runner] ?? DEFAULT_GLOBAL_DOM_SETUP),
    },
  };
}

function declaredMessage(declared: Declared, projectEnvironment: string | undefined): MessageId {
  if (!declared.isDirective) {
    return 'unusedRegisteredEnvironment';
  }
  return isDomEnvironment(projectEnvironment)
    ? 'unusedDirectiveOverDomProject'
    : 'unusedDirectiveEnvironment';
}

function reportFor(
  declared: Declared | undefined,
  options: EnvironmentOptions | undefined,
  runner: string,
): Reported {
  if (declared === undefined) {
    return projectReport(options, runner);
  }
  return {
    messageId: declaredMessage(declared, options?.environment),
    data: { environment: declared.name, directive: declared.directive },
    ...(declared.loc === undefined ? {} : { loc: declared.loc }),
  };
}

export const rule: TSESLint.RuleModule<MessageId, Options> = {
  meta: {
    type: 'problem',
    fixable: 'code',
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
    if (!layout.isRunnableTestFile(projectRelative(filename, context.cwd))) {
      return {};
    }
    const sourceCode = context.sourceCode;
    return {
      'Program:exit'(program) {
        const options = context.options[0];
        const runner = runnerOf(context);
        const declared = declaredEnvironment(sourceCode, runner);
        const environment = declared?.name ?? options?.environment;
        if (!isDomEnvironment(environment)) {
          return;
        }
        const aliases = bundlerAliases(options);
        if (mayUseDom(filename, sourceCode.text, aliases)) {
          return;
        }
        if (projectSetupUsesDom(options, context.cwd, aliases)) {
          return;
        }
        const plan =
          declared?.loc === undefined || declared.nameRange === undefined
            ? undefined
            : replacing(declared.nameRange, 'node');
        context.report(fixable({ node: program, ...reportFor(declared, options, runner) }, plan));
      },
    };
  },
};
