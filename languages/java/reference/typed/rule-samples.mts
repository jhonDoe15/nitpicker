export const SAMPLE_TARGET = {
  rootPackage: '<root>.<feature>',
  packageName: '<root>.<feature>.<package>',
};
export const SAMPLE_DETAILS: Record<string, string> = {
  'spring-layout': '<layer>',
  'spring-feature-boundary': '<OtherClass>',
  'spring-shared-pure': '<OtherClass>',
  'spring-controller-repository': '<Repository>',
  'spring-controller-entity': '<method>:<Entity>',
  'spring-service-web': '<WebType>',
  'spring-controller-controller': '<OtherController>',
  'spring-repository-service': '<Service>',
  'spring-scope-capture': '<scope>:<ScopedBean>',
  'ddd-aggregate-reference': '<OtherRoot>',
  'ddd-foreign-entity': '<Aggregate>:<Entity>',
  'ddd-value-object-reference': '<Entity>',
  'spring-request-state': '<field>:<mutator>:<request source>',
  'spring-typed-request-field': '<Type>.<field>:field:<Controller>.<method>',
  'spring-unmapped-exception': '<method>:<Exception>:<Service>.<method>',
};
export const SPRING_CONFIG_WHY: Record<string, string> = {
  default:
    'Nitpicker reads the Spring configuration files of a Spring project (`application.properties`, `application.yml` and their profile variants) for settings that are unsafe outside a test or local profile.',

  'missing-enable':
    'An annotation such as `@Scheduled` or `@Async` does nothing until the matching `@Enable...` is present, and Spring raises no error when it is missing.',
  'untrimmed-request-text': 'A padded search text finds nothing; trim request text once.',
  'unbound-property':
    'Spring ignores a key that binds to no property, so a misspelled or removed setting silently never takes effect.',
};
