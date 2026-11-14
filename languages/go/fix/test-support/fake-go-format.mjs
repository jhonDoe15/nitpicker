const GOROOT = '/goroot';
export const FAKE_GOFMT = `${GOROOT}/bin/gofmt`;

function squeezed(source) {
  return source.replaceAll(/ {2,}/gu, ' ').replaceAll('\r\n', '\n');
}

function isGoEnv({ command, args }) {
  return command === 'go' && args[0] === 'env';
}

export function fakeGoFormat({ formatterReply } = {}) {
  const calls = [];
  function execute(invocation) {
    calls.push(invocation);
    if (isGoEnv(invocation)) {
      return { status: 0, stdout: `${GOROOT}\n`, stderr: '' };
    }
    if (formatterReply !== undefined) {
      return formatterReply;
    }
    return invocation.input.includes('BROKEN')
      ? { status: 2, stdout: '', stderr: '<standard input>:1:1: expected declaration\n' }
      : { status: 0, stdout: squeezed(invocation.input), stderr: '' };
  }
  return {
    executeFixCommand: execute,
    formatterCalls: () => calls.filter((call) => !isGoEnv(call)),
  };
}
