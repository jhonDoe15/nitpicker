import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { childrenOf } from '../../../crap/functions/own-nodes.mjs';
import { handlerProblems } from './bindings/nest-handlers.mjs';
import { callProblems, routeSchemaProblems } from './bindings/request-calls.mjs';
import { sourceOf } from './bindings/ts-nodes.mjs';

const ZOD_BOOLEAN =
  "z.stringbool() or z.enum(['true', 'false']).transform((value) => value === 'true')";
const VALIBOT_BOOLEAN =
  "v.pipe(v.picklist(['true', 'false']), v.transform((value) => value === 'true'))";
const DTO_BOOLEAN = "@Transform(({ value }) => value === 'true')";
const CONVERTING_SCHEMA = 'a DTO or schema that converts it';

const FIXES = {
  zod: {
    number: 'z.coerce.number()',
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

const UNCHECKED = new Set(['param', 'type']);

function nodeProblems(node, checker) {
  if (ts.isMethodDeclaration(node)) {
    return handlerProblems(node, checker);
  }
  if (ts.isCallExpression(node)) {
    return callProblems(node, checker);
  }
  return ts.isPropertyAssignment(node) ? routeSchemaProblems(node, checker) : [];
}

function collect(file, checker) {
  const pending = [file];
  const found = [];
  for (const node of pending) {
    found.push(...nodeProblems(node, checker));
    pending.push(...childrenOf(node));
  }
  return found;
}

function messageId(problem) {
  if (problem.cast) {
    return 'booleanCast';
  }
  return UNCHECKED.has(problem.library) ? 'unconverted' : 'rejected';
}

function anchorOf(file, entry) {
  return entry.node.getSourceFile() === file ? entry.node : entry.binding;
}

function report(context, file, entry) {
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
      fix: FIXES[problem.library][problem.kind],
    },
  });
}

export const rule = {
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
        const reported = new Set();
        for (const entry of collect(file, checker)) {
          const key = `${entry.field}@${anchorOf(file, entry).pos}`;
          if (!reported.has(key)) {
            reported.add(key);
            report(context, file, entry);
          }
        }
      },
    };
  },
};
