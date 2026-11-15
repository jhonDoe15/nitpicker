import type { JSONSchema, TSESLint, TSESTree } from '@typescript-eslint/utils';
import path from 'node:path';
import { fixable } from '../../../fixes/support/descriptors.mts';
import { replacing } from '../../../fixes/support/ranges.mts';
import { readLayout } from '../../typed/policy-views.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import { scanDomEvidence } from './dom-evidence.mts';
import { closureUsesDom, setupUsesDom, type ModuleAlias } from './module-closure.mts';

type MessageId =
  'unusedDirectiveEnvironment' | 'unusedDirectiveOverDomProject' | 'unusedProjectEnvironment';
type AliasFind = string | { readonly pattern: string; readonly flags?: string };
type EnvironmentOptions = {
  readonly environment?: string;
  readonly setupFiles?: readonly string[];
  readonly aliases?: readonly { readonly find: AliasFind; readonly replacement: string }[];
};
type Options = readonly [EnvironmentOptions?];
type Declared = {
  readonly directive: string;
  readonly name: string;
  readonly loc: TSESTree.SourceLocation | undefined;
  readonly nameRange: TSESTree.Range;
};
type Reported = {
  readonly messageId: MessageId;
  readonly data: Readonly<Record<string, string | undefined>>;
  readonly loc?: TSESTree.SourceLocation;
};

const layout = readLayout();
const DOM_ENVIRONMENTS = new Set(['jsdom', 'happy-dom']);
const ENVIRONMENT_DIRECTIVE = /@(vitest|jest)-environment\s+([\w-]+)\b/u;
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

function projectRelative(filename: string, cwd: string): string {
  const relative = path.relative(cwd, filename).split(path.sep).join('/');
  if (!relative.startsWith('..')) {
    return relative;
  }
  const roots = [...layout.sourceRoots, ...layout.testRoots];
  const root = roots.find((candidate) => filename.includes(`/${candidate}/`));
  return root === undefined ? relative : filename.slice(filename.indexOf(`/${root}/`) + 1);
}

function declaredEnvironment(sourceCode: SourceCode): Declared | undefined {
  const match = ENVIRONMENT_DIRECTIVE.exec(sourceCode.text);
  const [, tool, name] = match ?? [];
  if (match === null || tool === undefined || name === undefined) {
    return undefined;
  }
  const comment = sourceCode
    .getAllComments()
    .find((candidate) => candidate.range[0] <= match.index && match.index < candidate.range[1]);
  const nameEnd = match.index + match[0].length;
  return {
    directive: `@${tool}-environment`,
    name,
    loc: comment?.loc,
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

function reportFor(
  declared: Declared | undefined,
  projectEnvironment: string | undefined,
): Reported {
  if (declared === undefined) {
    return { messageId: 'unusedProjectEnvironment', data: { environment: projectEnvironment } };
  }
  return {
    messageId: isDomEnvironment(projectEnvironment)
      ? 'unusedDirectiveOverDomProject'
      : 'unusedDirectiveEnvironment',
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
      unusedProjectEnvironment: `This test file runs in {{environment}}, the project default, but never uses the DOM. Add \`/** @vitest-environment node */\` here, or default to node and add \`/** @vitest-environment {{environment}} */\` to DOM tests. ${EXCEPTION_HINT}`,
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
        const declared = declaredEnvironment(sourceCode);
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
          declared?.loc === undefined ? undefined : replacing(declared.nameRange, 'node');
        context.report(
          fixable({ node: program, ...reportFor(declared, options?.environment) }, plan),
        );
      },
    };
  },
};
