export const HOSTS_VARIABLE = 'NITPICKER_TOOL_HOSTS';
export const HOSTS_OFF_VARIABLE = 'NITPICKER_NO_TOOL_HOSTS';
export const TRACE_VARIABLE = 'NITPICKER_TOOL_HOSTS_TRACE';

const JAVA_OPTION_VARIABLES = ['JDK_JAVA_OPTIONS', 'JAVA_TOOL_OPTIONS', '_JAVA_OPTIONS'];

export type HostEnvironment = {
  readonly hostsDirectory: string | undefined;
  readonly hostingOff: boolean;
  readonly traceFile: string | undefined;
  readonly javaOptions: string;
  readonly javaOptionVariables: readonly (string | undefined)[];
  readonly searchPath: string;
};

export function hostEnvironment(variables: NodeJS.ProcessEnv = process.env): HostEnvironment {
  return {
    hostsDirectory: variables[HOSTS_VARIABLE],
    hostingOff: variables[HOSTS_OFF_VARIABLE] !== undefined,
    traceFile: variables[TRACE_VARIABLE],
    javaOptions: variables['JDK_JAVA_OPTIONS'] ?? '',
    javaOptionVariables: JAVA_OPTION_VARIABLES.map((name) => variables[name]),
    searchPath: variables['PATH'] ?? '',
  };
}

export function exportHostsDirectory(directory: string): () => void {
  const previous = process.env[HOSTS_VARIABLE];
  process.env[HOSTS_VARIABLE] = directory;
  return () => {
    if (previous === undefined) {
      Reflect.deleteProperty(process.env, HOSTS_VARIABLE);
    } else {
      process.env[HOSTS_VARIABLE] = previous;
    }
  };
}
