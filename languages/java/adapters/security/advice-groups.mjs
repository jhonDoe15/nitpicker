const BIND =
  'Pass values as bind parameters (:name with JdbcClient or NamedParameterJdbcTemplate, setParameter in JPA) and never build query text from input.';
const SECRETS =
  'Read secrets from configuration or a secret store, never from a constant in the code.';
const DTO = 'Return and accept a DTO record, not a JPA entity.';
const AES = 'Use AES/GCM/NoPadding with a fresh random 12-byte IV per message.';
const NO_EVALUATE =
  'Never evaluate an expression or script built from input; keep it fixed and pass input as a variable.';
const DESERIALIZE =
  'Do not deserialize untrusted bytes with Java serialization; read JSON into a record with Jackson, without default typing.';
const TLS = 'Use the JVM default trust store and hostname verification, and TLS 1.2 or newer.';
const ESCAPE_OUTPUT =
  'Do not write input into a response; return a typed value as JSON, or let the template engine escape it.';
const FIXED_TEMPLATE =
  'Never take template or stylesheet text from input; load a fixed template and pass input as a model value.';
const FIXED_BASE =
  'Resolve against a fixed base directory, normalize(), check startsWith(base), and never use a client file name as a path.';
const FIXED_VIEW =
  'Do not build a view or forward path from input; map input to a fixed set of names.';
const SECURE_XML =
  'Parse XML with XMLConstants.FEATURE_SECURE_PROCESSING and the disallow-doctype-decl feature set.';

export const ADVICE_GROUPS = [
  {
    patterns: [
      'SQL_INJECTION',
      'SQL_INJECTION_VERTX',
      'SQL_INJECTION_TURBINE',
      'SQL_INJECTION_HIBERNATE',
      'SQL_INJECTION_JDO',
      'SQL_INJECTION_JPA',
      'SQL_INJECTION_SPRING_JDBC',
      'SQL_INJECTION_JDBC',
      'SQL_INJECTION_ANDROID',
      'SCALA_SQL_INJECTION_SLICK',
      'SCALA_SQL_INJECTION_ANORM',
      'AWS_QUERY_INJECTION',
      'CUSTOM_INJECTION',
    ],
    text: BIND,
  },
  {
    patterns: ['LDAP_INJECTION', 'LDAP_ENTRY_POISONING'],
    text: 'Use a filter with parameters ({0}) or escape values with LdapEncoder, and never concatenate input into a filter or name.',
  },
  {
    patterns: ['LDAP_ANONYMOUS'],
    text: 'Bind to the directory with credentials, not anonymously.',
  },
  {
    patterns: ['XPATH_INJECTION'],
    text: 'Bind input through an XPathVariableResolver instead of concatenating it into the expression.',
  },
  {
    patterns: ['COMMAND_INJECTION', 'SCALA_COMMAND_INJECTION'],
    text: 'Run a fixed command and give each input as its own ProcessBuilder argument; never join input into a command line or sh -c.',
  },
  {
    patterns: [
      'PATH_TRAVERSAL_IN',
      'PATH_TRAVERSAL_OUT',
      'SCALA_PATH_TRAVERSAL_IN',
      'FILE_UPLOAD_FILENAME',
    ],
    text: FIXED_BASE,
  },
  {
    patterns: ['WEAK_FILENAMEUTILS'],
    text: 'Reject names containing a null byte or path separators before FilenameUtils, or generate the name yourself.',
  },
  {
    patterns: [
      'SPRING_FILE_DISCLOSURE',
      'STRUTS_FILE_DISCLOSURE',
      'REQUESTDISPATCHER_FILE_DISCLOSURE',
    ],
    text: FIXED_VIEW,
  },
  {
    patterns: [
      'XXE_SAXPARSER',
      'XXE_XMLREADER',
      'XXE_DOCUMENT',
      'XXE_DTD_TRANSFORM_FACTORY',
      'XXE_SCHEMA_FACTORY',
      'XXE_XSLT_TRANSFORM_FACTORY',
      'XXE_XMLSTREAMREADER',
      'XXE_XPATH',
      'XXE_VALIDATOR',
    ],
    text: SECURE_XML,
  },
  {
    patterns: ['POTENTIAL_XML_INJECTION'],
    text: 'Build XML with a writer or DOM API that escapes values, not by concatenating input.',
  },
  {
    patterns: [
      'XML_DECODER',
      'OBJECT_DESERIALIZATION',
      'JACKSON_UNSAFE_DESERIALIZATION',
      'DESERIALIZATION_GADGET',
    ],
    text: DESERIALIZE,
  },
  {
    patterns: ['URLCONNECTION_SSRF_FD', 'SCALA_PLAY_SSRF'],
    text: 'Do not fetch a URL taken from input; build it from a configured base URL and a template variable, or check the host against an allow-list.',
  },
  {
    patterns: [
      'XSS_REQUEST_WRAPPER',
      'XSS_JSP_PRINT',
      'JSP_JSTL_OUT',
      'XSS_SERVLET',
      'SCALA_XSS_TWIRL',
      'SCALA_XSS_MVC_API',
      'WICKET_XSS1',
      'ANDROID_WEB_VIEW_JAVASCRIPT',
    ],
    text: ESCAPE_OUTPUT,
  },
  {
    patterns: ['UNVALIDATED_REDIRECT', 'PLAY_UNVALIDATED_REDIRECT', 'SPRING_UNVALIDATED_REDIRECT'],
    text: 'Redirect to a fixed route, or check the target against an allow-list of paths.',
  },
  {
    patterns: ['HTTP_RESPONSE_SPLITTING', 'SMTP_HEADER_INJECTION'],
    text: 'Reject line breaks in values that go into a header, or set them through the framework API that encodes them.',
  },
  {
    patterns: ['CRLF_INJECTION_LOGS'],
    text: 'Log input as a {} argument and strip line breaks from it first, or encode it.',
  },
  {
    patterns: ['HTTP_PARAMETER_POLLUTION'],
    text: 'URL-encode each value (UriComponentsBuilder or a URI template) instead of concatenating it into a query.',
  },
  {
    patterns: ['FORMAT_STRING_MANIPULATION'],
    text: 'Use a fixed format string and pass input as an argument.',
  },
  {
    patterns: [
      'TEMPLATE_INJECTION_VELOCITY',
      'TEMPLATE_INJECTION_FREEMARKER',
      'TEMPLATE_INJECTION_PEBBLE',
      'MALICIOUS_XSLT',
      'JSP_XSLT',
    ],
    text: FIXED_TEMPLATE,
  },
  {
    patterns: [
      'SPEL_INJECTION',
      'EL_INJECTION',
      'SEAM_LOG_INJECTION',
      'OGNL_INJECTION',
      'GROOVY_SHELL',
      'SCRIPT_ENGINE_INJECTION',
      'JSP_SPRING_EVAL',
      'JSP_INCLUDE',
    ],
    text: NO_EVALUATE,
  },
  {
    patterns: ['BEAN_PROPERTY_INJECTION', 'EXTERNAL_CONFIG_CONTROL'],
    text: 'Do not let input choose a property, class or configuration key; map it to a fixed set of names.',
  },
  { patterns: ['ENTITY_LEAK', 'ENTITY_MASS_ASSIGNMENT'], text: DTO },
  {
    patterns: ['SPRING_CSRF_PROTECTION_DISABLED'],
    text: 'Keep CSRF protection on. Only a stateless API that authenticates by token header, with no cookie session, may turn it off.',
  },
  {
    patterns: ['PERMISSIVE_CORS'],
    text: 'List the allowed origins explicitly instead of *.',
  },
  {
    patterns: ['INSECURE_COOKIE', 'HTTPONLY_COOKIE'],
    text: 'Set both secure and HttpOnly on the cookie (ResponseCookie.from(...).secure(true).httpOnly(true)).',
  },
  {
    patterns: ['COOKIE_PERSISTENT'],
    text: 'Use a session cookie, or give the persistent cookie a short, justified lifetime.',
  },
  {
    patterns: ['URL_REWRITING'],
    text: 'Keep the session id out of URLs; use cookie sessions only.',
  },
  {
    patterns: ['WEAK_MESSAGE_DIGEST_MD5', 'WEAK_MESSAGE_DIGEST_SHA1'],
    text: 'Use SHA-256 or stronger, and hash passwords with a PasswordEncoder such as BCrypt.',
  },
  {
    patterns: ['CUSTOM_MESSAGE_DIGEST'],
    text: 'Use a standard MessageDigest (SHA-256) instead of a hand-written one.',
  },
  {
    patterns: [
      'DES_USAGE',
      'TDES_USAGE',
      'NULL_CIPHER',
      'ECB_MODE',
      'PADDING_ORACLE',
      'CIPHER_INTEGRITY',
      'STATIC_IV',
    ],
    text: AES,
  },
  {
    patterns: [
      'RSA_NO_PADDING',
      'RSA_KEY_SIZE',
      'BLOWFISH_KEY_SIZE',
      'HAZELCAST_SYMMETRIC_ENCRYPTION',
      'ESAPI_ENCRYPTOR',
    ],
    text: 'Use RSA with OAEP padding and at least 2048-bit keys, or AES-256 with GCM.',
  },
  {
    patterns: ['BAD_HEXA_CONVERSION'],
    text: 'Convert bytes with HexFormat.of().formatHex(bytes), not Integer.toHexString on a byte.',
  },
  { patterns: ['HARD_CODE_PASSWORD', 'HARD_CODE_KEY'], text: SECRETS },
  {
    patterns: ['PREDICTABLE_RANDOM', 'PREDICTABLE_RANDOM_SCALA'],
    text: 'Use SecureRandom for tokens, ids, salts and anything an attacker must not guess; jitter and sampling are the exception case.',
  },
  {
    patterns: ['UNSAFE_HASH_EQUALS'],
    text: 'Compare secrets and hashes with MessageDigest.isEqual, which takes constant time.',
  },
  {
    patterns: [
      'WEAK_TRUST_MANAGER',
      'WEAK_HOSTNAME_VERIFIER',
      'SSL_CONTEXT',
      'DEFAULT_HTTP_CLIENT',
    ],
    text: TLS,
  },
  {
    patterns: ['INSECURE_SMTP_SSL', 'UNENCRYPTED_SOCKET', 'UNENCRYPTED_SERVER_SOCKET'],
    text: 'Use TLS: SSLSocketFactory or SSLServerSocketFactory for sockets, and enable certificate checks for mail.',
  },
  {
    patterns: ['REDOS'],
    text: 'Use a regex without nested or overlapping quantifiers, and cap the length of the input before matching.',
  },
  {
    patterns: ['TRUST_BOUNDARY_VIOLATION'],
    text: 'Validate input before it goes into the session, or store an id and look the value up.',
  },
  {
    patterns: ['INFORMATION_EXPOSURE_THROUGH_AN_ERROR_MESSAGE'],
    text: 'Log the exception and send the client a fixed message or ProblemDetail, never the exception text or a stack trace.',
  },
  {
    patterns: ['SAML_IGNORE_COMMENTS'],
    text: 'Configure the SAML parser with setIgnoreComments(true).',
  },
  {
    patterns: ['RPC_ENABLED_EXTENSIONS'],
    text: 'Leave XML-RPC extensions disabled.',
  },
  {
    patterns: ['OVERLY_PERMISSIVE_FILE_PERMISSION', 'DANGEROUS_PERMISSION_COMBINATION'],
    text: 'Grant the owner only the access the file needs; never world-readable, world-writable or AllPermission.',
  },
  {
    patterns: [
      'IMPROPER_UNICODE',
      'MODIFICATION_AFTER_VALIDATION',
      'NORMALIZATION_AFTER_VALIDATION',
    ],
    text: 'Normalize and change case first, then validate, so the checked value is the used value.',
  },
  {
    patterns: [
      'ANDROID_EXTERNAL_FILE_ACCESS',
      'ANDROID_BROADCAST',
      'ANDROID_WORLD_WRITABLE',
      'ANDROID_GEOLOCATION',
      'ANDROID_WEB_VIEW_JAVASCRIPT_INTERFACE',
    ],
    text: 'Keep app data private to the app and expose nothing to other apps or web content without a check.',
  },
  {
    patterns: ['STRUTS_FORM_VALIDATION'],
    text: 'Validate the form in a validator, not by trusting the bound values.',
  },
  {
    patterns: ['SCALA_SENSITIVE_DATA_EXPOSURE'],
    text: 'Do not log or return sensitive data.',
  },
];
