import { detachLocalGitVariables } from '../../diff/git/environment/local-variables.mts';
import { CHECK_COMMAND_NAMES } from './check-names.mts';
import type { CheckCli, TextOutput } from '../../cli-context.mts';

type CheckCommand = (cli: CheckCli) => Promise<number>;

type Host = {
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly stdout: TextOutput;
  readonly stderr: TextOutput;
};

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
  return CHECK_COMMAND_NAMES.has(name) && Object.hasOwn(CHECK_COMMANDS, name)
    ? CHECK_COMMANDS[name]
    : undefined;
}

function helpFlag(argument: string): string {
  return argument === '-h' ? '--help' : argument;
}

export async function runCheckCli(host: Host): Promise<number> {
  detachLocalGitVariables(host.env);
  const [name = '', ...commandArguments] = host.argv.slice(2).map(helpFlag);
  const command = checkCommandOf(name);
  if (command === undefined) {
    throw new Error(`Unknown check command: ${name}`);
  }
  return command({
    commandArguments,
    stdout: host.stdout,
    stderr: host.stderr,
    environment: host.env,
  });
}
