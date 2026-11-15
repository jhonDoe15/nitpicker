type Invocation = {
  command: string;
  args: readonly string[];
  input: string | undefined;
  cwd: string;
};
type Reply = { status: number; stdout: string; stderr: string };

const GOROOT = '/goroot';
export const FAKE_GOFMT = `${GOROOT}/bin/gofmt`;

function squeezed(source: string) {
  return source.replaceAll(/ {2,}/gu, ' ').replaceAll('\r\n', '\n');
}

function isGoEnv({ command, args }: Invocation) {
  return command === 'go' && args[0] === 'env';
}

export function fakeGoFormat({ formatterReply }: { formatterReply?: Reply } = {}): {
  executeFixCommand: (invocation: Invocation) => Reply;
  formatterCalls: () => Invocation[];
} {
  const calls: Invocation[] = [];
  function execute(invocation: Invocation): Reply {
    calls.push(invocation);
    if (isGoEnv(invocation)) {
      return { status: 0, stdout: `${GOROOT}\n`, stderr: '' };
    }
    if (formatterReply !== undefined) {
      return formatterReply;
    }
    return (invocation.input ?? '').includes('BROKEN')
      ? { status: 2, stdout: '', stderr: '<standard input>:1:1: expected declaration\n' }
      : { status: 0, stdout: squeezed(invocation.input ?? ''), stderr: '' };
  }
  return {
    executeFixCommand: execute,
    formatterCalls: () => calls.filter((call) => !isGoEnv(call)),
  };
}
