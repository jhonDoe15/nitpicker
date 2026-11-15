import type { CaptureOptions, CapturedOutput } from './output-types.mts';

export function captureOutput({ terminal }: CaptureOptions = {}): CapturedOutput {
  let stdoutText = '';
  let stderrText = '';
  return {
    stdout: {
      isTTY: terminal === true,
      write(value: string) {
        stdoutText += value;
      },
    },
    stderr: {
      write(value: string) {
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
