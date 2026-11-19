export const REUSABLE_OBJECT_RULE = 'ReusableObjectPerCall';

export const REUSABLE_OBJECT_MESSAGE =
  'Build this once and reuse it: once built it is safe to share between threads, and building it costs far more than using it. Keep it in a static final constant, a final field set in the constructor, or a @Bean.';

export const REUSABLE_CONSTRUCTORS = [
  'com.fasterxml.jackson.databind.ObjectMapper',
  'com.fasterxml.jackson.databind.json.JsonMapper',
  'com.fasterxml.jackson.dataformat.xml.XmlMapper',
  'com.fasterxml.jackson.dataformat.yaml.YAMLMapper',
  'tools.jackson.databind.ObjectMapper',
  'tools.jackson.databind.json.JsonMapper',
  'com.google.gson.Gson',
  'com.google.gson.GsonBuilder',
];

const MAPPER_BUILDERS = [
  'com.fasterxml.jackson.databind.json.JsonMapper',
  'com.fasterxml.jackson.dataformat.xml.XmlMapper',
  'com.fasterxml.jackson.dataformat.yaml.YAMLMapper',
  'tools.jackson.databind.json.JsonMapper',
].map((type) => [type, ['builder']]);

export const REUSABLE_FACTORIES = [
  ...MAPPER_BUILDERS,
  ['jakarta.xml.bind.JAXBContext', ['newInstance']],
  ['javax.xml.bind.JAXBContext', ['newInstance']],
  [
    'jakarta.validation.Validation',
    ['buildDefaultValidatorFactory', 'byDefaultProvider', 'byProvider'],
  ],
  [
    'javax.validation.Validation',
    ['buildDefaultValidatorFactory', 'byDefaultProvider', 'byProvider'],
  ],
];

export const CONSTANT_PATTERN_FACTORIES = [['java.time.format.DateTimeFormatter', ['ofPattern']]];

export const REUSABLE_RESULT_TYPES = [
  'ObjectMapper',
  'JsonMapper',
  'XmlMapper',
  'YAMLMapper',
  'Gson',
  'GsonBuilder',
  'JAXBContext',
  'ValidatorFactory',
  'Validator',
  'DateTimeFormatter',
];

export const SETUP_ANNOTATIONS = [
  'org.springframework.context.annotation.Bean',
  'jakarta.annotation.PostConstruct',
  'javax.annotation.PostConstruct',
  'jakarta.enterprise.inject.Produces',
  'javax.enterprise.inject.Produces',
];

export const SETUP_METHODS = ['afterPropertiesSet', 'start'];

export const CACHING_CALLS = ['computeIfAbsent', 'withInitial', 'memoize', 'memoizeWithExpiration'];

export const STORING_CALLS = ['put', 'putIfAbsent', 'set'];
