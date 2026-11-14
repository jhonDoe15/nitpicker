import { RULES_TOOL } from '../tool.mjs';
import { parseEffect, pathPhrase, splitPath } from '../effects/subject.mjs';

const STRAWBERRY_ADVICE =
  'Batch the lookup with a DataLoader: create `strawberry.dataloader.DataLoader(load_fn=load_customers)` once per request (in `get_context`) whose function takes all keys and returns the rows in the order of the keys, and have the resolver `return await info.context.customer_loader.load(self.customer_id)`; or read data the parent already carries.';
const GRAPHENE_ADVICE =
  'Batch the lookup with a DataLoader (`aiodataloader.DataLoader` or `promise.dataloader.DataLoader`) created once per request: the resolver returns `info.context.customer_loader.load(parent.customer_id)`; or read data the parent already carries, or fetch the relation in the query that returns the list (`select_related`, `selectinload`).';
const EXCEPTION = ' An exception fits only when the parent list is known to stay tiny.';

function describe(subject) {
  const { path, fields } = parseEffect(subject);
  const [parent, field = parent] = path[0].split('.');
  const [, kind, call = ''] = fields;
  const effect = kind === 'remote' ? 'a remote request' : 'a database query';
  return `The resolver \`${field}\` of \`${parent}\` runs once per parent and sends ${effect} with ${pathPhrase(splitPath(call))} each time, so a list of N parents costs N ${kind === 'remote' ? 'requests' : 'queries'}`;
}

function allowed(subject) {
  const advice =
    parseEffect(subject).fields[0] === 'strawberry' ? STRAWBERRY_ADVICE : GRAPHENE_ADVICE;
  return `${advice}${EXCEPTION}`;
}

export const RESOLVER_HINTS = [
  { tool: RULES_TOOL, rules: ['resolver-query-per-parent'], describe, allowed },
];
