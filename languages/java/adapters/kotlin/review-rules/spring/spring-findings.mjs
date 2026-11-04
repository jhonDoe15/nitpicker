import { COLUMN_RULES } from './data/columns.mjs';
import { ENTITY_RULES } from './data/entities.mjs';
import { LOOP_RULES } from './data/loops.mjs';
import { QUERY_RULES } from './data/queries.mjs';
import { BEAN_RULES } from './rules/beans.mjs';
import { CLIENT_RULES } from './rules/clients.mjs';
import { CONFIGURATION_RULES } from './rules/configuration.mjs';
import { PROXY_RULES } from './rules/proxies.mjs';
import { TRANSACTION_RULES } from './rules/transactions.mjs';
import { springMessage } from './spring-messages.mjs';
import { springViews } from './view/spring-view.mjs';
import { ERROR_LEAK_RULES } from './web/error-leaks.mjs';
import { SECURITY_RULES } from './web/security.mjs';
import { WEB_RULES } from './web/web.mjs';

const RULES = [
  ...BEAN_RULES,
  ...CLIENT_RULES,
  ...CONFIGURATION_RULES,
  ...PROXY_RULES,
  ...TRANSACTION_RULES,
  ...WEB_RULES,
  ...ERROR_LEAK_RULES,
  ...SECURITY_RULES,
  ...ENTITY_RULES,
  ...COLUMN_RULES,
  ...QUERY_RULES,
  ...LOOP_RULES,
];

export function springFindings(
  files,
  {
    finding,
    manifest,
    projectFiles,
    projectRoot,
    javaRoots,
    rules = RULES,
    message = springMessage,
  },
) {
  if (manifest.spring !== true) {
    return [];
  }
  const options = { allOpen: manifest.kotlinAllOpen, projectFiles };
  return springViews({ files, projectFiles, projectRoot, javaRoots }).flatMap((view) =>
    rules
      .flatMap((rule) => rule(view, options))
      .toSorted((left, right) => left.line - right.line)
      .map(({ rule, line, symbol, key }) =>
        finding({ rule, file: view.file.file, line, symbol, key, message: message(rule) }),
      ),
  );
}
