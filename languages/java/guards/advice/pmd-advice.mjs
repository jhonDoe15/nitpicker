import { exceptionRoute } from './exception-route.mjs';

const ALLOWED_FORMS = {
  AddEmptyString: 'Use String.valueOf(value).',
  AppendCharacterWithChar: "Append a char literal ('c').",
  AvoidCalendarDateCreation: 'Use java.time with an injected Clock, as in Instant.now(clock).',
  AvoidFileStream:
    'Use Files.newInputStream, Files.newOutputStream, Files.newBufferedReader or Files.newBufferedWriter.',
  AvoidSynchronizedStatement:
    'Use a ReentrantLock, an atomic or a concurrent collection instead of synchronized.',
  AvoidThreadGroup: 'Submit the work to an ExecutorService.',
  BigIntegerInstantiation: 'Use the ZERO, ONE and TEN constants.',
  ConsecutiveAppendsShouldReuse: 'Chain the calls: builder.append(a).append(b).',
  DoubleCheckedLocking:
    'Initialize the value in a static holder class, or let the framework create it once.',
  HardCodedCryptoKey: 'Load the key from a key store or a secret manager.',
  InefficientEmptyStringCheck: 'Use String.isBlank().',
  InefficientStringBuffering: 'Append each part with its own append call.',
  InsecureCryptoIv: 'Generate a random IV with SecureRandom for every encryption.',
  NonThreadSafeSingleton:
    'Create the instance eagerly or in a static holder class, or let the framework manage it.',
  OptimizableToArrayCall: 'Call toArray(new T[0]).',
  RedundantFieldInitializer: 'Remove the initializer: the field already starts with that value.',
  StringInstantiation: 'Use the string itself.',
  StringToString: 'Remove the toString() call.',
  UnsynchronizedStaticFormatter:
    'Use a static java.time DateTimeFormatter, which is thread-safe, or a local formatter.',
  UseArraysAsList: 'Use Arrays.asList(array) or List.of(array).',
  UseIOStreamsWithApacheCommonsFileItem: 'Read the upload with FileItem.getInputStream().',
  UseStringBufferLength: 'Call length() on the builder.',
};

function sentence(text) {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function withPmdAdvice(finding) {
  if (finding.tool !== 'pmd' || finding.message.includes('nitpicker.config.json')) {
    return finding;
  }
  const allowed = ALLOWED_FORMS[finding.rule];
  const advice = allowed === undefined ? '' : ` ${allowed}`;
  return {
    ...finding,
    message: `${sentence(finding.message)}${advice} ${exceptionRoute('pmd', finding.rule)}`,
  };
}
