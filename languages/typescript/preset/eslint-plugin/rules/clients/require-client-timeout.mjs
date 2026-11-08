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
        '{{client}} has no statement timeout, so a stuck query holds this request and its pool connection for good. Set one where the client is built: `statement_timeout: 30_000` in the pg options, TypeORM `extra`, Sequelize `dialectOptions`, or the Knex and postgres.js `connection`. An exception fits only when this client is meant to wait without a limit, such as a migration runner, or when the database role sets the timeout.',
      aws: '{{client}} has no request timeout, so a call that never answers holds this code for good. Set it once for the client: `requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000, throwOnRequestTimeout: true }`. An exception fits only when this client is meant to wait without a limit.',
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
