const NATIVE_TYPESCRIPT_CONFIG = 'unstable_native_nodejs_ts_config';

export function nativeConfigFlags(
  configFile: string,
  features: { readonly typescript?: unknown } = process.features,
): string[] {
  return configFile.endsWith('.mts') && typeof features.typescript === 'string'
    ? [NATIVE_TYPESCRIPT_CONFIG]
    : [];
}
