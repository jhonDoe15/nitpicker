import { COLUMN_RULES } from './data/columns.mts';
import { ENTITY_RULES } from './data/entities.mts';
import { FOREIGN_KEY_RULES } from './data/keys/foreign-keys.mts';
import { LOOP_RULES } from './data/loops/loops.mts';
import { QUERY_RULES } from './data/queries.mts';
import { BEAN_RULES } from './rules/beans.mts';
import { CLIENT_RULES } from './rules/clients.mts';
import { CONFIGURATION_RULES } from './rules/configuration/configuration.mts';
import { nullOnlyConfigChecks } from './rules/configuration/null-checks.mts';
import { PROXY_RULES } from './rules/proxies.mts';
import { TRANSACTION_RULES } from './rules/transactions.mts';
import { CACHE_WRITE_RULES } from './transactions/cache-writes.mts';
import { UNGUARDED_WRITE_RULES } from './transactions/unguarded-writes.mts';
import { springMessage } from './spring-messages.mts';
import { springViews } from './view/spring-view.mts';
import { ERROR_LEAK_RULES } from './web/error-leaks.mts';
import { OUTBOUND_RULES } from './web/outbound.mts';
import { SECURITY_RULES } from './web/security.mts';
import { WEB_RULES } from './web/web.mts';
import { WIRING_RULES } from './wiring/wiring.mts';
import { STARTUP_RULES } from './lifecycle/startup-cleanup.mts';
import { UNRELEASED_RULES } from './lifecycle/unreleased.mts';
import { foreignKeyGate } from '../../../jpa/foreign-keys/key-gate.mts';
import { sequenceGate } from '../../../jpa/sequence-ids.mts';
import type {
  AllOpen,
  Reported,
  SourceFile,
  SpringRule,
  SpringView,
} from './typed/spring-shapes.mts';

const gateOf: (projectRoot: string) => (file: string) => boolean = foreignKeyGate;

type FindingInput = {
  rule: string;
  file: string;
  line: number;
  symbol: string;
  key: string | undefined;
  message: string | undefined;
  allowedForm: string | undefined;
};

type SpringFindingOptions<Found> = {
  finding: (input: FindingInput) => Found;
  manifest: {
    spring?: unknown;
    kotlinAllOpen?: AllOpen | undefined;
    springClasspath?: string[] | undefined;
  };
  projectFiles: SourceFile[];
  projectRoot: string;
  javaRoots?: string[] | undefined;
  foreignKeys?: ((file: string) => boolean) | undefined;
  sequenceIds?: ((file: string) => boolean) | undefined;
  rules?: SpringRule[];
  message?: (rule: string) => string | undefined;
};

const RULES: SpringRule[] = [
  ...BEAN_RULES,
  ...WIRING_RULES,
  ...UNRELEASED_RULES,
  ...STARTUP_RULES,
  ...CLIENT_RULES,
  ...CONFIGURATION_RULES,
  nullOnlyConfigChecks,
  ...PROXY_RULES,
  ...TRANSACTION_RULES,
  ...UNGUARDED_WRITE_RULES,
  ...CACHE_WRITE_RULES,
  ...WEB_RULES,
  ...ERROR_LEAK_RULES,
  ...SECURITY_RULES,
  ...OUTBOUND_RULES,
  ...ENTITY_RULES,
  ...FOREIGN_KEY_RULES,
  ...COLUMN_RULES,
  ...QUERY_RULES,
  ...LOOP_RULES,
];

const SPRING_DATA_RULES = new Set([
  'SpringDataRowWriteInLoop',
  'SpringDataNoFlush',
  'SpringDataNoSaveInLoop',
  'SpringDataSaveInLoopHelper',
  'SpringDataNativeQuery',
]);
const SPRING_DATA_JAR = /(^|[\\/])spring-data-(commons|jpa)-[^\\/]*\.jar$/u;
const SPRING_DATA_PACKAGE = 'org.springframework.data.';

function usesSpringData(
  manifest: { springClasspath?: string[] | undefined },
  projectFiles: SourceFile[],
): boolean {
  const classpath = manifest.springClasspath ?? [];
  return (
    classpath.length === 0 ||
    classpath.some((entry) => SPRING_DATA_JAR.test(entry)) ||
    projectFiles.some((file) =>
      file.imports.some(({ path }) => path.startsWith(SPRING_DATA_PACKAGE)),
    )
  );
}

export function springFindings<Found>(
  files: SourceFile[],
  {
    finding,
    manifest,
    projectFiles,
    projectRoot,
    javaRoots,
    foreignKeys = gateOf(projectRoot),
    sequenceIds = sequenceGate(projectRoot),
    rules = RULES,
    message = springMessage,
  }: SpringFindingOptions<Found>,
): Found[] {
  if (manifest.spring !== true) {
    return [];
  }
  const springData = usesSpringData(manifest, projectFiles);
  const options = {
    allOpen: manifest.kotlinAllOpen,
    projectFiles,
    checksForeignKeys: foreignKeys,
    allowsSequenceIds: sequenceIds,
  };
  return springViews({ files, projectFiles, projectRoot, javaRoots }).flatMap((view: SpringView) =>
    rules
      .flatMap((rule) => rule(view, options))
      .filter(({ rule }) => springData || !SPRING_DATA_RULES.has(rule))
      .toSorted((left, right) => left.line - right.line)
      .map(({ rule, line, symbol, key }: Reported) =>
        finding({
          rule,
          file: view.file.file,
          line,
          symbol,
          key,
          message: message(rule),
          allowedForm: message(rule),
        }),
      ),
  );
}
