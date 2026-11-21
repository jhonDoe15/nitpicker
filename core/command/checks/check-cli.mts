import { withCliDefaults } from '../../cli-defaults.mts';
import { detachLocalGitVariables } from '../../diff/git/environment/local-variables.mts';
import type { CheckCli, CliInput } from '../../cli-context.mts';

type CheckCommand = (cli: CheckCli) => Promise<number>;

const CHECK_COMMANDS: Readonly<Record<string, CheckCommand>> = {
  hygiene: async (cli) => {
    const [{ runHygieneCli }, { yamlDocuments }] = await Promise.all([
      import('../../../shared/hygiene/runner.mts'),
      import('../../tooling/yaml/yaml-documents.mts'),
    ]);
    return runHygieneCli({ ...cli, parseYaml: yamlDocuments });
  },
  history: async (cli) => {
    const { runHistoryCli } = await import('../../../shared/history/runner.mts');
    return runHistoryCli(cli);
  },
};

export function checkCommandOf(name: string): CheckCommand | undefined {
  return Object.hasOwn(CHECK_COMMANDS, name) ? CHECK_COMMANDS[name] : undefined;
}

export async function runCli(options: CliInput = {}): Promise<number> {
  detachLocalGitVariables(process.env);
  const cli = withCliDefaults(options, process);
  const [name = '', ...commandArguments] = cli.arguments_;
  const command = checkCommandOf(name);
  if (command === undefined) {
    throw new Error(`Unknown check command: ${name}`);
  }
  return command({
    commandArguments,
    stdout: cli.stdout,
    stderr: cli.stderr,
    environment: cli.environment,
  });
}
