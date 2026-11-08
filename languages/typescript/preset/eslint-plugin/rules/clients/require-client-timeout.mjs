import { moduleScope } from '../database/orm-modules.mjs';
import { clientTimeout } from './client-calls.mjs';
import { ormOptionsTimeout, sequelizeUrlTimeout } from './orm-timeouts.mjs';
import { MISSING } from './timeout-options.mjs';

function report(context, node, found) {
  if (found?.state === MISSING) {
    context.report({ node, messageId: found.kind, data: { client: found.name } });
  }
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a timeout on database and AWS SDK clients' },
    schema: [],
    messages: {
      database:
        '{{client}} has no statement timeout, so a stuck query holds this request and its pool connection for good. Set it once for the client: `new Pool({ statement_timeout: 30_000, query_timeout: 35_000 })` for pg, `extra: { statement_timeout: 30_000 }` for a TypeORM DataSource, `dialectOptions: { statement_timeout: 30_000 }` for Sequelize, `connection: { statement_timeout: 30_000 }` for Knex and postgres.js. An exception fits only when this client is meant to wait without a limit, such as a migration runner.',
      aws: '{{client}} has no request timeout, so a call that never answers hangs this code for good. Set it once for the client: `new {{client}}({ requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000, throwOnRequestTimeout: true } })`, or pass a `NodeHttpHandler` built with those options. An exception fits only when this client is meant to wait without a limit.',
    },
  },
  create(context) {
    const scope = moduleScope(context);
    return {
      NewExpression(node) {
        report(context, node, clientTimeout(scope, node) ?? sequelizeUrlTimeout(scope, node));
      },
      CallExpression(node) {
        report(context, node, clientTimeout(scope, node));
      },
      ObjectExpression(node) {
        report(context, node, ormOptionsTimeout(scope, node));
      },
    };
  },
};
