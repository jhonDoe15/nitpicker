import type { TSESLint } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { ts } from '../typed/typescript-views.mts';
import { handlerProblems } from './bindings/nest-handlers.mts';
import { callProblems, routeSchemaProblems } from './bindings/request-calls.mts';
import { sourceOf } from './bindings/ts-nodes.mts';
import type { Checker, Kind, Library, Located, Problem } from './problem-types.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

type MessageIds = 'rejected' | 'unconverted' | 'booleanCast';
type Context = Readonly<TSESLint.RuleContext<MessageIds, readonly []>>;

const ZOD_BOOLEAN =
  "z.stringbool() (zod 4) or z.enum(['true', 'false']).transform((value) => value === 'true')";
const VALIBOT_BOOLEAN =
  "v.pipe(v.picklist(['true', 'false']), v.transform((value) => value === 'true'))";
const DTO_BOOLEAN = "@Transform(({ value }) => value === 'true')";
const CONVERTING_SCHEMA = 'a DTO or schema that converts it';

const FIXES: Readonly<Record<Library, Readonly<Partial<Record<Kind, string>>>>> = {
  zod: {
    number: 'z.coerce.number()',
    integer: 'z.coerce.number().int()',
    bigint: 'z.coerce.bigint()',
    date: 'z.coerce.date()',
    boolean: ZOD_BOOLEAN,
  },
  valibot: {
    number: 'v.pipe(v.string(), v.toNumber(), v.number())',
    bigint: 'v.pipe(v.string(), v.toBigint())',
    date: 'v.pipe(v.string(), v.toDate())',
    boolean: VALIBOT_BOOLEAN,
  },
  'class-validator': {
    number: '@Type(() => Number)',
    bigint: '@Transform(({ value }) => BigInt(value))',
    date: '@Type(() => Date)',
    boolean: DTO_BOOLEAN,
  },
  param: {
    number: 'ParseIntPipe or ParseFloatPipe',
    bigint: 'a pipe that calls BigInt',
    date: 'ParseDatePipe',
    boolean: 'ParseBoolPipe',
  },
  type: {
    number: CONVERTING_SCHEMA,
    bigint: CONVERTING_SCHEMA,
    date: CONVERTING_SCHEMA,
    boolean: CONVERTING_SCHEMA,
  },
};

const UNCHECKED = new Set<Library>(['param', 'type']);

function nodeProblems(node: TypeScript.Node, checker: Checker): Located[] {
  if (ts.isMethodDeclaration(node)) {
    return handlerProblems(node, checker);
  }
  if (ts.isCallExpression(node)) {
    return callProblems(node, checker);
  }
  return ts.isPropertyAssignment(node) ? routeSchemaProblems(node, checker) : [];
}

function collect(file: TypeScript.SourceFile, checker: Checker): Located[] {
  const pending: TypeScript.Node[] = [file];
  const found: Located[] = [];
  for (const node of pending) {
    appendAll(found, nodeProblems(node, checker));
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return found;
}

function messageId(problem: Problem): MessageIds {
  if (problem.cast) {
    return 'booleanCast';
  }
  return UNCHECKED.has(problem.library) ? 'unconverted' : 'rejected';
}

function anchorOf(file: TypeScript.SourceFile, entry: Located): TypeScript.Node {
  return entry.node.getSourceFile() === file ? entry.node : entry.binding;
}

function report(context: Context, file: TypeScript.SourceFile, entry: Located): void {
  const anchor = anchorOf(file, entry);
  const { sourceCode } = context;
  const { problem } = entry;
  context.report({
    loc: {
      start: sourceCode.getLocFromIndex(anchor.getStart(file)),
      end: sourceCode.getLocFromIndex(anchor.getEnd()),
    },
    messageId: messageId(problem),
    data: {
      field: entry.field,
      source: entry.source,
      form: problem.form,
      fix: problem.fix ?? FIXES[problem.library][problem.kind],
    },
  });
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow number, bigint, boolean and date fields read from the query string, path, headers or a multipart form without converting the text',
    },
    schema: [],
    messages: {
      rejected:
        '{{field}} arrives from the {{source}} as text, so {{form}} rejects every request that sets it. Convert the text where the field is declared: {{fix}}.',
      unconverted:
        '{{field}} arrives from the {{source}} as text, but {{form}} claims otherwise and nothing at the declaration converts it. Convert it there with {{fix}}.',
      booleanCast:
        '{{field}} arrives from the {{source}} as text, and {{form}} turns "false" into true. Compare the text instead: {{fix}}.',
    },
  },
  create(context) {
    return {
      'Program:exit'() {
        const { file, checker } = sourceOf(context);
        const reported = new Set<string>();
        for (const entry of collect(file, checker)) {
          const key = `${entry.field}@${String(anchorOf(file, entry).pos)}`;
          if (!reported.has(key)) {
            reported.add(key);
            report(context, file, entry);
          }
        }
      },
    };
  },
};
