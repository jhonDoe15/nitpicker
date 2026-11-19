import { RULES_TOOL } from '../tool.mts';
import { parseEffect } from '../effects/subject.mts';
import type { RuleHint } from '../hint-types.mts';

export const DATABASE_ALIAS_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['database-alias-not-passed'],
    describe: (subject) => {
      const { path, fields } = parseEffect(subject);
      const [name = '<function>'] = path;
      const [operation = '<call>', alias = 'using', variant] = fields;
      if (variant === 'other') {
        return `\`${name}\` has the database alias \`${alias}\` in scope, but \`${operation}\` passes a different one: the work goes to another database than the one this call runs against, so reads miss rows, writes land in the wrong place and a rollback leaves the other half committed`;
      }
      if (variant === 'historical') {
        return `\`${name}\` is a data migration function, but \`${operation}\` uses the current model class or the default database: the class can have fields the migrated schema does not have yet, and the query ignores the database the migration runs against`;
      }
      return `\`${name}\` has the database alias \`${alias}\` in scope, but \`${operation}\` does not use it: the call goes to the default database, so it misses rows written through the other connection, writes to the wrong database, and a rollback leaves the other half committed`;
    },
    allowed: (subject) => {
      const [, alias = 'using', variant] = parseEffect(subject).fields;
      if (variant === 'historical') {
        return `Take the model from the \`apps\` argument (\`Item = apps.get_model("shop", "Item")\`), not from the app's models module or a helper that uses it, and query with \`.using(${alias})\`; this applies in projects with one database too.`;
      }
      return `Pass the alias on: \`Model.objects.using(${alias})\` or \`.db_manager(${alias})\` for a query, \`instance.save(using=${alias})\` and \`instance.delete(using=${alias})\`, \`transaction.atomic(using=${alias})\`, \`transaction.set_rollback(True, using=${alias})\` and \`transaction.on_commit(func, using=${alias})\`. A queryset already bound with \`instance._state.db\` is fine. In a data migration take the models from the \`apps\` argument and the alias from \`schema_editor.connection.alias\`.`;
    },
  },
];
