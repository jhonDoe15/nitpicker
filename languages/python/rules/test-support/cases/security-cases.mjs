import { everyRule as every, ruffCases } from './define.mjs';

export const SECURITY_CASES = [
  ...ruffCases('shell-commands', [
    ...every(['S602', 'S604', 'S605'], 'leave `shell=true` out'),
    ['S609', 'separate list items'],
  ]),
  ...ruffCases('sql-queries', [['S608', 'query parameters']]),
  ...ruffCases('weak-hash', every(['S324', 'S303'], 'sha256')),
  ...ruffCases('tls-settings', [
    ['S501', 'certificate verification on'],
    ...every(['S502', 'S503', 'S504', 'S323'], 'create_default_context'),
    ['S505', '2048 bits'],
  ]),
  ...ruffCases('http-timeout', [['S113', 'timeout=10']]),
  ...ruffCases('unsafe-loading', [
    ...every(['S301', 'S302'], 'json.loads'),
    ['S506', 'yaml.safe_load'],
  ]),
  ...ruffCases('eval-exec', every(['S102', 'S307'], 'ast.literal_eval')),
  ...ruffCases('temp-files', every(['S108', 'S306'], 'tempfile')),
  ...ruffCases(
    'xml-parsers',
    every(['S313', 'S314', 'S315', 'S316', 'S317', 'S318', 'S319'], 'defusedxml'),
  ),
  ...ruffCases('tar-extract', [['S202', 'filter="data"']]),
  ...ruffCases('flask-debug', [['S201', 'flask --debug run']]),
  ...ruffCases('weak-ciphers', every(['S304', 'S305'], 'aesgcm')),
  ...ruffCases('ssh-host-keys', [['S507', 'rejectpolicy']]),
  ...ruffCases('legacy-protocols', every(['S312', 'S321'], 'sftp')),
  ...ruffCases('html-escaping', [...every(['S308', 'S704'], 'format_html'), ['S701', 'jinja2']]),
  ...ruffCases('mako-templates', [['S702', 'jinja2']]),
  ...ruffCases('django-queries', every(['S610', 'S611'], 'orm query api')),
  ...ruffCases('logging-listen', [['S612', 'dictconfig']]),
  ...ruffCases('snmp-security', every(['S508', 'S509'], 'snmpv3')),
];
