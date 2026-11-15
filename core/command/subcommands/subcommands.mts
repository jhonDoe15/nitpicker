import { runCacheCommand } from '../cache.mts';
import { runExplainCommand, runRulesCommand } from '../reference/reference.mts';
import { runBaseCommand } from '../base.mts';
import { runShowCommand } from '../show/show.mts';
import { runInitCommand } from '../../init/run-init.mts';
import type { Subcommand } from '../../cli-context.mts';

export const SUBCOMMANDS: Readonly<Record<string, Subcommand>> = {
  cache: (cli, rest) => runCacheCommand({ ...cli, arguments_: rest }),
  init: (cli, rest) => runInitCommand({ ...cli, arguments_: rest }),
  base: (cli, rest) => runBaseCommand({ ...cli, arguments_: rest }),
  show: (cli, rest) => runShowCommand({ ...cli, arguments_: rest }),
  explain: (cli, rest) => runExplainCommand({ ...cli, commandArguments: rest }),
  rules: (cli, rest) => runRulesCommand({ ...cli, commandArguments: rest }),
};
