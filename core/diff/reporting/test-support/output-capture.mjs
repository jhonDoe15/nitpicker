export function captureOutput({ terminal = false } = {}) {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: {
      isTTY: terminal,
      write(value) {
        stdoutText += value;
      },
    },
    stderr: {
      write(value) {
        stderrText += value;
      },
    },
    get stdoutText() {
      return stdoutText;
    },
    get stderrText() {
      return stderrText;
    },
  };
}
