import { stripBracketsAndQuotes } from '../spring-config-files.mts';
import { relaxKey } from '../spring-config-parser.mts';
import { isTestOrLocal, isTrue } from './profiles.mts';
import { placeholderDefault } from '../spring-secrets.mts';
import type { ConfigEntry, ConfigRule } from '../typed/config-types.mts';

const EXPOSURE = relaxKey('management.endpoints.web.exposure.include');
const DEFAULT_ACCESS = relaxKey('management.endpoints.access.default');
const SENSITIVE_ENDPOINTS = new Set([
  'auditevents',
  'beans',
  'caches',
  'conditions',
  'configprops',
  'env',
  'heapdump',
  'httpexchanges',
  'httptrace',
  'jolokia',
  'logfile',
  'loggers',
  'mappings',
  'quartz',
  'sessions',
  'shutdown',
  'threaddump',
]);
const OPEN_ACCESS = new Map<string, ReadonlySet<string>>([
  [relaxKey('management.endpoint.shutdown.access'), new Set(['unrestricted'])],
  [relaxKey('management.endpoint.heapdump.access'), new Set(['unrestricted', 'readonly'])],
]);
const SHUTDOWN_SWITCHES = new Set(
  ['management.endpoint.shutdown.enabled', 'management.endpoints.enabled-by-default'].map(relaxKey),
);

export function isSensitiveEndpoint(endpoint: string): boolean {
  return SENSITIVE_ENDPOINTS.has(endpoint);
}

function valueOf(entry: ConfigEntry): string {
  return placeholderDefault(entry.value.trim()).toLowerCase();
}

function exposureProblem(entry: ConfigEntry): string | undefined {
  const endpoints = stripBracketsAndQuotes(entry.value)
    .split(',')
    .map((item) => item.trim().toLowerCase());
  if (endpoints.includes('*')) {
    return 'List only the actuator endpoints you need in management.endpoints.web.exposure.include, for example health,info; * exposes every endpoint.';
  }
  const sensitive = endpoints.filter((endpoint) => SENSITIVE_ENDPOINTS.has(endpoint));
  return sensitive.length === 0
    ? undefined
    : `List only health, info and metrics endpoints such as prometheus in management.endpoints.web.exposure.include; ${sensitive.join(', ')} serve configuration, heap or thread contents, or control of the running application.`;
}

function accessProblem(entry: ConfigEntry, key: string): string | undefined {
  const value = valueOf(entry).replaceAll(/[-_]/g, '');
  if (key === DEFAULT_ACCESS && value === 'unrestricted') {
    return `Leave ${entry.key} unset, or set it to read-only, and open single endpoints with management.endpoint.<id>.access; unrestricted also opens the shutdown and heapdump endpoints.`;
  }
  if (OPEN_ACCESS.get(key)?.has(value)) {
    return `Set ${entry.key} to none, or remove it; ${entry.value.trim()} lets callers stop the application or download its memory.`;
  }
  return SHUTDOWN_SWITCHES.has(key) && isTrue({ value })
    ? `Remove ${entry.key}=true; it turns the shutdown endpoint on.`
    : undefined;
}

export const ACTUATOR_RULE: ConfigRule = {
  rule: 'actuator-exposure',
  exempt: isTestOrLocal,
  lists: true,
  problem: (entry, key) => (key === EXPOSURE ? exposureProblem(entry) : accessProblem(entry, key)),
};
