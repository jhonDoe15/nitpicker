export type Cli = { runCli: () => unknown };
export type Loaded =
  (Cli & { loadError?: undefined }) | { loadError: SyntaxError; runCli?: undefined };
export type Manifest = { engines: { node: string } };
export type Stderr = { write: (text: string) => unknown };

export const parseManifest: (text: string) => Manifest = JSON.parse;
