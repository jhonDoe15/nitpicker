import { rulesCases } from './define.mjs';

const LOOP_RULE = 'io-in-loop';

export const RULES_CASES = [
  ...rulesCases('sql-queries', [['sql-string-formatting', 'query parameters']]),
  ...rulesCases('tls-verification', [['tls-verification-off', 'trust the certificate authority']]),
  ...rulesCases('security-support-rules', [
    ['tls-verification-off', 'verify_mode = ssl.cert_optional'],
  ]),
  ...rulesCases('weak-hmac', [['weak-hmac', 'hashlib.sha256']]),
  ...rulesCases('http-client-timeout', [['http-without-timeout', 'timeout=10']]),
  ...rulesCases('unsafe-model-loading', [['unsafe-deserialization', 'yaml.safe_load']]),
  ...rulesCases('shell-command-forms', [['shell-command', 'shell=false']]),
  ...rulesCases('env-access', [['process-env-access', 'composition root']]),
  ...rulesCases('domain-clock', [['clock-now', 'datetime.now(tz=utc)']]),
  ...rulesCases('domain-random', [['random-in-domain', 'random.random']]),
  ...rulesCases('domain-io', [['io-in-domain', 'protocol']]),
  ...rulesCases('mutable-module-state', [['module-level-mutable-state', 'composition root']]),
  ...rulesCases('path-join', [['unsafe-path-join', 'is_relative_to']]),
  ...rulesCases('boundary-guard', [['handwritten-boundary-guard', 'model_validate']]),
  ...rulesCases('domain-any', [['any-in-domain', 'frozen dataclass']]),
  ...rulesCases('pydantic-any', [['pydantic-any-field', 'real type']]),
  ...rulesCases('pydantic-extra', [['pydantic-extra-allow', 'extra="forbid"']]),
  ...rulesCases('repeated-string', [['repeated-string-literal', 'constant']]),
  ...rulesCases('generic-name', [['generic-name', 'name it for its job']]),
  ...rulesCases('hardcoded-secret', [['hardcoded-secret', 'environment']]),
  ...rulesCases('credential-shape', [['credential-shape', 'environment']]),
  ...rulesCases('secret-in-log', [['secret-in-log', 'masked tail']]),
  ...rulesCases('io-in-loop', [[LOOP_RULE, 'batch it']]),
  ...rulesCases('io-in-loop-concurrent', [
    [LOOP_RULE, 'concurrently still sends one query', 'repo.get()|database|concurrent'],
  ]),
  ...rulesCases('io-in-loop-remote', [[LOOP_RULE, 'asyncio.Semaphore', 'requests.get()|remote']]),
  ...rulesCases('accumulator-copy', [
    ['accumulator-copy', 'itertools.chain', 'merged|merged + [...]|loop'],
  ]),
  ...rulesCases('lazy-relation-django', [
    ['lazy-relation-in-loop', 'select_related', 'Order.customer|django|Order.objects.all()'],
  ]),
  ...rulesCases('lazy-relation-sqlalchemy', [
    ['lazy-relation-in-loop', 'selectinload', 'Order.customer|sqlalchemy|select(Order)'],
  ]),
  ...rulesCases('remote-in-transaction', [
    ['remote-call-in-transaction', 'outbox', 'requests.post()|transaction.atomic()'],
  ]),
  ...rulesCases('remote-under-lock', [
    ['remote-call-under-lock', 'releasing', 'requests.get()|LOCK'],
  ]),
  ...rulesCases('todo-without-issue', [['todo-without-issue', '# todo(#123)']]),
  ...rulesCases('skipped-test', [['skipped-test-without-reason', 'reason=']]),
  ...rulesCases('sleep-in-test', [['sleep-in-test', 'fake clock']]),
  ...rulesCases('tautological-assert', [['tautological-assert', 'result of the code under test']]),
  ...rulesCases('test-without-assertion', [
    ['test-without-assertion', 'assert result == expected'],
  ]),
  ...rulesCases('catch-log-without-exception', [
    ['catch-log-without-exception', 'logger.exception'],
  ]),
  ...rulesCases('real-clock-test', [['real-clock-in-test', 'freeze']]),
  ...rulesCases('random-test', [['random-in-test', 'seed']]),
  ...rulesCases('network-test', [['network-in-test', 'fake']]),
  ...rulesCases('uncollected-tests', [['uncollected-tests', 'python_files']]),
  ...rulesCases('test-helper-in-source', [['test-helper-in-source', 'tests folder']]),
];
