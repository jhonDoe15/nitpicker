export function captureOutput() {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: {
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
