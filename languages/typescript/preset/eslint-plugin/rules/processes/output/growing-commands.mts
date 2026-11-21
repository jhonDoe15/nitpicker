import { gitSubcommand, type Subprocess } from '../../analysis/subprocess-calls.mts';

const GIT_GROWING = new Set(['ls-files', 'ls-tree', 'diff', 'log', 'rev-list', 'status', 'grep']);
const SHORT_FLAGS = /^-[a-zA-Z]+$/u;
const GIT_QUIET = new Set(['--quiet', '-q', '--exit-code', '--shortstat', '--count']);
const GIT_LIMITED_HISTORY = /^(?:-\d+|-n\d*|--max-count(?:=.*)?|--max-parents(?:=.*)?|--no-walk)$/u;
const ALWAYS_GROWING = new Set(['find', 'rg', 'du', 'tree']);
const SHELL_OPERATORS = /[|<>;&`]|\$\(/u;
const INFO_FLAGS = new Set(['--version', '-V', '--help', '-h', '--error-unmatch']);
const ONE_FILE = /^[^*?[\]]*\.[A-Za-z0-9]+$/u;

function bounded(name: string, tokens: readonly string[]): boolean {
  if (tokens.some((token) => INFO_FLAGS.has(token))) {
    return true;
  }
  const pathspec = tokens.indexOf('--');
  if (pathspec !== -1 && tokens.length > pathspec + 1) {
    return tokens.slice(pathspec + 1).every((token) => ONE_FILE.test(token));
  }
  if (name === 'du') {
    return tokens.some(
      (token) => token === '--summarize' || (SHORT_FLAGS.test(token) && token.includes('s')),
    );
  }
  const depth = tokens.indexOf('-maxdepth');
  return name === 'find' && depth !== -1 && tokens[depth + 1] === '0';
}

export function baseName(command: string): string {
  return command.split(/[\\/]/u).at(-1) ?? command;
}

function gitGrows(tokens: readonly string[]): boolean {
  const subcommand = gitSubcommand(tokens);
  if (subcommand === undefined || !GIT_GROWING.has(subcommand)) {
    return false;
  }
  if (tokens.some((token) => GIT_QUIET.has(token))) {
    return false;
  }
  if (
    subcommand === 'ls-tree' &&
    !tokens.some((token) => SHORT_FLAGS.test(token) && token.includes('r'))
  ) {
    return false;
  }
  const history = subcommand === 'log' || subcommand === 'rev-list';
  return !(history && tokens.some((token) => GIT_LIMITED_HISTORY.test(token)));
}

function commandGrows(name: string, tokens: readonly string[]): boolean {
  if (name === 'git') {
    return gitGrows(tokens);
  }
  if (ALWAYS_GROWING.has(name)) {
    return !tokens.some((token) => token === '-q' || token === '--quiet');
  }
  if (name === 'ls' || name === 'grep') {
    return tokens.some(
      (token) => token === '--recursive' || (SHORT_FLAGS.test(token) && /[rR]/u.test(token)),
    );
  }
  return name === 'npm' && (tokens[0] === 'ls' || tokens[0] === 'list');
}

export function growingCommand(subprocess: Subprocess, shellText: string | undefined): boolean {
  const { command } = subprocess;
  if (command === undefined || (shellText !== undefined && SHELL_OPERATORS.test(shellText))) {
    return false;
  }
  const name = baseName(command);
  return !bounded(name, subprocess.tokens) && commandGrows(name, subprocess.tokens);
}
