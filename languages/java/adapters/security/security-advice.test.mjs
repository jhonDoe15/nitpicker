import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { pinnedJavaTools } from '../../../../core/licensing/dependency-licenses.mjs';
import { ADVICE_GROUPS } from './advice-groups.mjs';
import {
  enclosingMethod,
  securityMessage,
  securityPatterns,
  securitySubject,
  withSecurityMessages,
} from './security-advice.mjs';

const LISTED_VERSION = '1.14.0';

const FIND_SEC_BUGS_PATTERNS = [
  'ANDROID_BROADCAST',
  'ANDROID_EXTERNAL_FILE_ACCESS',
  'ANDROID_GEOLOCATION',
  'ANDROID_WEB_VIEW_JAVASCRIPT',
  'ANDROID_WEB_VIEW_JAVASCRIPT_INTERFACE',
  'ANDROID_WORLD_WRITABLE',
  'AWS_QUERY_INJECTION',
  'BAD_HEXA_CONVERSION',
  'BEAN_PROPERTY_INJECTION',
  'BLOWFISH_KEY_SIZE',
  'CIPHER_INTEGRITY',
  'COMMAND_INJECTION',
  'COOKIE_PERSISTENT',
  'COOKIE_USAGE',
  'CRLF_INJECTION_LOGS',
  'CUSTOM_INJECTION',
  'CUSTOM_MESSAGE_DIGEST',
  'DANGEROUS_PERMISSION_COMBINATION',
  'DEFAULT_HTTP_CLIENT',
  'DESERIALIZATION_GADGET',
  'DES_USAGE',
  'ECB_MODE',
  'EL_INJECTION',
  'ENTITY_LEAK',
  'ENTITY_MASS_ASSIGNMENT',
  'ESAPI_ENCRYPTOR',
  'EXTERNAL_CONFIG_CONTROL',
  'FILE_UPLOAD_FILENAME',
  'FORMAT_STRING_MANIPULATION',
  'GROOVY_SHELL',
  'HARD_CODE_KEY',
  'HARD_CODE_PASSWORD',
  'HAZELCAST_SYMMETRIC_ENCRYPTION',
  'HTTPONLY_COOKIE',
  'HTTP_PARAMETER_POLLUTION',
  'HTTP_RESPONSE_SPLITTING',
  'IMPROPER_UNICODE',
  'INFORMATION_EXPOSURE_THROUGH_AN_ERROR_MESSAGE',
  'INSECURE_COOKIE',
  'INSECURE_SMTP_SSL',
  'JACKSON_UNSAFE_DESERIALIZATION',
  'JAXRS_ENDPOINT',
  'JAXWS_ENDPOINT',
  'JSP_INCLUDE',
  'JSP_JSTL_OUT',
  'JSP_SPRING_EVAL',
  'JSP_XSLT',
  'LDAP_ANONYMOUS',
  'LDAP_ENTRY_POISONING',
  'LDAP_INJECTION',
  'MALICIOUS_XSLT',
  'MODIFICATION_AFTER_VALIDATION',
  'NORMALIZATION_AFTER_VALIDATION',
  'NULL_CIPHER',
  'OBJECT_DESERIALIZATION',
  'OGNL_INJECTION',
  'OVERLY_PERMISSIVE_FILE_PERMISSION',
  'PADDING_ORACLE',
  'PATH_TRAVERSAL_IN',
  'PATH_TRAVERSAL_OUT',
  'PERMISSIVE_CORS',
  'PLAY_UNVALIDATED_REDIRECT',
  'POTENTIAL_XML_INJECTION',
  'PREDICTABLE_RANDOM',
  'PREDICTABLE_RANDOM_SCALA',
  'REDOS',
  'REQUESTDISPATCHER_FILE_DISCLOSURE',
  'RPC_ENABLED_EXTENSIONS',
  'RSA_KEY_SIZE',
  'RSA_NO_PADDING',
  'SAML_IGNORE_COMMENTS',
  'SCALA_COMMAND_INJECTION',
  'SCALA_PATH_TRAVERSAL_IN',
  'SCALA_PLAY_SSRF',
  'SCALA_SENSITIVE_DATA_EXPOSURE',
  'SCALA_SQL_INJECTION_ANORM',
  'SCALA_SQL_INJECTION_SLICK',
  'SCALA_XSS_MVC_API',
  'SCALA_XSS_TWIRL',
  'SCRIPT_ENGINE_INJECTION',
  'SEAM_LOG_INJECTION',
  'SERVLET_CONTENT_TYPE',
  'SERVLET_HEADER',
  'SERVLET_HEADER_REFERER',
  'SERVLET_HEADER_USER_AGENT',
  'SERVLET_PARAMETER',
  'SERVLET_QUERY_STRING',
  'SERVLET_SERVER_NAME',
  'SERVLET_SESSION_ID',
  'SMTP_HEADER_INJECTION',
  'SPEL_INJECTION',
  'SPRING_CSRF_PROTECTION_DISABLED',
  'SPRING_CSRF_UNRESTRICTED_REQUEST_MAPPING',
  'SPRING_ENDPOINT',
  'SPRING_FILE_DISCLOSURE',
  'SPRING_UNVALIDATED_REDIRECT',
  'SQL_INJECTION',
  'SQL_INJECTION_ANDROID',
  'SQL_INJECTION_HIBERNATE',
  'SQL_INJECTION_JDBC',
  'SQL_INJECTION_JDO',
  'SQL_INJECTION_JPA',
  'SQL_INJECTION_SPRING_JDBC',
  'SQL_INJECTION_TURBINE',
  'SQL_INJECTION_VERTX',
  'SSL_CONTEXT',
  'STATIC_IV',
  'STRUTS1_ENDPOINT',
  'STRUTS2_ENDPOINT',
  'STRUTS_FILE_DISCLOSURE',
  'STRUTS_FORM_VALIDATION',
  'TAPESTRY_ENDPOINT',
  'TDES_USAGE',
  'TEMPLATE_INJECTION_FREEMARKER',
  'TEMPLATE_INJECTION_PEBBLE',
  'TEMPLATE_INJECTION_VELOCITY',
  'TRUST_BOUNDARY_VIOLATION',
  'UNENCRYPTED_SERVER_SOCKET',
  'UNENCRYPTED_SOCKET',
  'UNSAFE_HASH_EQUALS',
  'UNVALIDATED_REDIRECT',
  'URLCONNECTION_SSRF_FD',
  'URL_REWRITING',
  'WEAK_FILENAMEUTILS',
  'WEAK_HOSTNAME_VERIFIER',
  'WEAK_MESSAGE_DIGEST_MD5',
  'WEAK_MESSAGE_DIGEST_SHA1',
  'WEAK_TRUST_MANAGER',
  'WICKET_ENDPOINT',
  'WICKET_XSS1',
  'XML_DECODER',
  'XPATH_INJECTION',
  'XSS_JSP_PRINT',
  'XSS_REQUEST_WRAPPER',
  'XSS_SERVLET',
  'XXE_DOCUMENT',
  'XXE_DTD_TRANSFORM_FACTORY',
  'XXE_SAXPARSER',
  'XXE_SCHEMA_FACTORY',
  'XXE_VALIDATOR',
  'XXE_XMLREADER',
  'XXE_XMLSTREAMREADER',
  'XXE_XPATH',
  'XXE_XSLT_TRANSFORM_FACTORY',
];

const excludeFilter = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../gradle/security/exclude.xml'),
  'utf8',
);
const sinks = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../gradle/security/jakarta-sinks.txt',
  ),
  'utf8',
);

function queryOffsetFromTop(line) {
  const parameters = /\(([^)]*)\)/.exec(line)[1];
  return (parameters.match(/L[^;]+;/g) ?? []).length - 1;
}

function sinkOffsetErrors(text) {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .filter((line) => Number(line.split(':').at(-1)) !== queryOffsetFromTop(line));
}

const excluded = [...excludeFilter.matchAll(/pattern="([^"]*)"/g)].flatMap(([, list]) =>
  list.split(','),
);

const initScript = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../../gradle/nitpicker.init.gradle'),
  'utf8',
);

describe('find-sec-bugs advice', () => {
  it('lists the patterns of the version the init script pins', () => {
    const pinned = pinnedJavaTools(initScript).find(({ tool }) => tool === 'findSecBugs');

    expect(
      pinned?.version,
      `FIND_SEC_BUGS_PATTERNS is the list of find-sec-bugs ${LISTED_VERSION} but the init script pins another version. Regenerate it: unzip the findsecbugs-plugin jar, list the <BugPattern type=...> values of findbugs.xml, update the list and LISTED_VERSION, then give each new pattern advice in advice-groups.mjs or exclude it in gradle/security/exclude.xml.`,
    ).toBe(LISTED_VERSION);
  });

  it('covers every pattern of the pinned plugin that is not excluded, and nothing else', () => {
    const covered = securityPatterns();

    expect([...covered, ...excluded].sort()).toEqual([...FIND_SEC_BUGS_PATTERNS].sort());
  });

  it('gives each pattern one piece of advice', () => {
    const listed = ADVICE_GROUPS.flatMap(({ patterns }) => patterns);

    expect(new Set(listed).size).toBe(listed.length);
  });

  it('excludes only markers that are not defects and the duplicates of PMD rules', () => {
    expect(
      excluded.filter(
        (pattern) =>
          !/ENDPOINT|^SERVLET_|^COOKIE_USAGE$|^SPRING_CSRF_(?:UNRESTRICTED_REQUEST_MAPPING|PROTECTION_DISABLED)$/.test(
            pattern,
          ),
      ),
    ).toEqual([]);
  });

  it('names the allowed form and the exception route, briefly', () => {
    for (const pattern of securityPatterns()) {
      const message = securityMessage(pattern);

      expect(
        message.endsWith(`add an exception for spotbugs/${pattern} in nitpicker.config.json.`),
      ).toBe(true);
      expect(message.length).toBeLessThan(330);
    }
  });

  it('writes the SQL advice for the Spring and JPA cases', () => {
    expect(securityMessage('SQL_INJECTION_JPA')).toBe(
      'Pass values as bind parameters (:name with JdbcClient or NamedParameterJdbcTemplate, setParameter in JPA) and never build query text from input. If it is right here, add an exception for spotbugs/SQL_INJECTION_JPA in nitpicker.config.json.',
    );
  });

  it('has no message for a SpotBugs core pattern', () => {
    expect(securityMessage('DM_DEFAULT_ENCODING')).toBeUndefined();
  });
});

const result = (ruleId, method) => ({
  ruleId,
  message: { text: 'generic', arguments: ['a'] },
  locations: [{ logicalLocations: method === undefined ? [] : [{ fullyQualifiedName: method }] }],
});

describe('security results', () => {
  it('replaces the message of a find-sec-bugs result and keeps the others', () => {
    const log = {
      runs: [
        {
          results: [result('COMMAND_INJECTION', 'a.B.run(String)'), result('DM_DEFAULT_ENCODING')],
        },
      ],
    };

    const [security, core] = withSecurityMessages(log).runs[0].results;

    expect(security.message).toEqual({
      text: securityMessage('COMMAND_INJECTION'),
      arguments: ['a'],
    });
    expect(core).toEqual(log.runs[0].results[1]);
  });

  it('tolerates a log without runs or results', () => {
    expect(withSecurityMessages({})).toEqual({ runs: [] });
    expect(withSecurityMessages({ runs: [{}] })).toEqual({ runs: [{ results: [] }] });
  });

  it('reads the enclosing method', () => {
    expect(enclosingMethod(result('X', 'a.B.run(String)'))).toBe('a.B.run');
    expect(enclosingMethod(result('X', 'a.B.run()'))).toBe('a.B.run');
    expect(enclosingMethod(result('X'))).toBeUndefined();
    expect(enclosingMethod({ ruleId: 'X' })).toBeUndefined();
  });

  it('tells apart two results of one pattern in different methods', () => {
    const first = securitySubject(result('COMMAND_INJECTION', 'a.B.one()'), 'text');
    const second = securitySubject(result('COMMAND_INJECTION', 'a.B.two()'), 'text');

    expect(first).not.toBe(second);
  });

  it('keeps the identity when only a parameter type of the method changes', () => {
    const before = securitySubject(result('COMMAND_INJECTION', 'a.B.run(String)'), 'text');
    const after = securitySubject(result('COMMAND_INJECTION', 'a.B.run(java.lang.Object)'), 'text');

    expect(after).toBe(before);
  });

  it('leaves the identity of a core SpotBugs result alone', () => {
    expect(securitySubject(result('DM_DEFAULT_ENCODING', 'a.B.run()'), 'text')).toBe('text');
  });
});

describe('jakarta-sinks.txt', () => {
  it('marks the query text, counted from the last argument, as the sink', () => {
    expect(sinkOffsetErrors(sinks)).toEqual([]);
  });

  it('lists the five EntityManager query methods', () => {
    expect(
      sinks
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => line.split('(')[0]),
    ).toEqual([
      'jakarta/persistence/EntityManager.createQuery',
      'jakarta/persistence/EntityManager.createQuery',
      'jakarta/persistence/EntityManager.createNativeQuery',
      'jakarta/persistence/EntityManager.createNativeQuery',
      'jakarta/persistence/EntityManager.createNativeQuery',
    ]);
  });
});

describe('sinkOffsetErrors', () => {
  it('counts the query text from the last argument', () => {
    expect(queryOffsetFromTop('a.b(Ljava/lang/String;)V:0')).toBe(0);
    expect(queryOffsetFromTop('a.b(Ljava/lang/String;Ljava/lang/Class;)V:1')).toBe(1);
  });

  it('reports a line with the wrong offset', () => {
    expect(
      sinkOffsetErrors('a.b(Ljava/lang/String;Ljava/lang/Class;)V:0\na.c(Ljava/lang/String;)V:0\n'),
    ).toEqual(['a.b(Ljava/lang/String;Ljava/lang/Class;)V:0']);
  });
});
