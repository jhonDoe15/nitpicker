type LaunchSpec = {
  readonly command: string;
  readonly args: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
};

export type Launcher = {
  readonly description: string;
  launch(tool: string, args: readonly string[]): LaunchSpec;
};
