export type CapturedOutput = {
  readonly stdout: { readonly isTTY: boolean; write(value: string): void };
  readonly stderr: { write(value: string): void };
  readonly stdoutText: string;
  readonly stderrText: string;
};

export type CaptureOptions = { readonly terminal?: true | undefined };
