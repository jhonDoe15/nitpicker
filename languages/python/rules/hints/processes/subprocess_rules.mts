import { RULES_TOOL } from '../tool.mts';
import type { RuleHint } from '../hint-types.mts';

export const SUBPROCESS_RULE_HINTS: readonly RuleHint[] = [
  {
    tool: RULES_TOOL,
    rules: ['growing-process-arguments'],
    describe: (subject) =>
      `\`${subject}\` passes a list that grows with the project (a file listing, glob result or path list) ` +
      `in child process arguments, which fails with \`E2BIG\` ("Argument list too long") on a large project`,
    allowed:
      'Pass the list another way: an argument file (`@args.txt`), standard input, a file-list option ' +
      '(`--files-from`), the `CLASSPATH` environment variable for a class path, or the list split into chunks.',
  },
  {
    tool: RULES_TOOL,
    rules: ['unguarded-option-list'],
    describe: (subject) =>
      `\`${subject}\` builds a process option from a filtered or listed sequence without checking whether it is empty, ` +
      `so an empty list passes an empty value or consumes the next flag`,
    allowed:
      'Check the list first (`if not dirs: return`) and skip the option or the run when it is empty.',
  },
  {
    tool: RULES_TOOL,
    rules: ['status-only-spawn-check'],
    describe: (subject) =>
      `\`${subject}\` checks a subprocess exit status in a way that treats \`None\` (still running) or a negative ` +
      `signal exit code (such as \`-9\` from \`SIGKILL\`) as success or passes \`None\` to \`sys.exit\``,
    allowed:
      'Check `returncode is None` before using an unwaited `Popen` or `poll()` result, and compare with ' +
      '`returncode != 0` or `returncode == 0` (or pass `check=True`) so negative signal exits count as failures.',
  },
  {
    tool: RULES_TOOL,
    rules: ['stderr-as-failure'],
    describe: (subject) =>
      `\`${subject}\` treats any text on standard error of a finished child process as a failure, ` +
      `even though standard error also carries warnings, notices and progress`,
    allowed:
      'Decide failure by the exit status (`result.returncode != 0` or `check=True`) and keep `result.stderr` ' +
      'for the error message.',
  },
  {
    tool: RULES_TOOL,
    rules: ['head-cut-error-output'],
    describe: (subject) =>
      `\`${subject}\` keeps only the start of tool output in an error, dropping the failing task, ` +
      `cause or summary printed at the end`,
    allowed:
      'Keep the end of the output (`stderr[-4000:]`), or keep both the start and the end with a marker between them.',
  },
  {
    tool: RULES_TOOL,
    rules: ['wrapper-only-timeout'],
    describe: (subject) =>
      `This timed subprocess runs through ${subject}, so when the timeout fires only the wrapper dies ` +
      `and its child process keeps running in the background`,
    allowed:
      'Start the target executable directly without a wrapper, or start `Popen` with `start_new_session=True` ' +
      'and kill the whole process group on timeout (`os.killpg(proc.pid, signal.SIGKILL)` on POSIX, `taskkill /T /F` on Windows).',
  },
];
