const DOMAIN_WHY =
  'Domain rules that do I/O or depend on infrastructure cannot be tested or reused without that infrastructure, and the infrastructure cannot change without them.';

export const BOUNDARY_NOTES = {
  'foreign-feature-persistence': [
    "A production module of one feature that uses a persistent entity or data access module of another feature, also through that feature's public face.",
    'A feature that writes or reads the tables of another one shares its schema, so neither can change its storage alone.',
    "Call a service the other feature exposes, or keep a read model of your own fed by that feature's events or queries.",
  ],
  'domain-imports-adapter': [
    'Domain code that uses a project class in an adapter or infrastructure package.',
    DOMAIN_WHY,
    'Declare a port (an interface) in the domain and let the adapter implement it.',
  ],
  'domain-imports-io': [
    'Domain code that does file, network, thread or process work.',
    DOMAIN_WHY,
    'Do the I/O in an adapter behind a port the domain declares, and pass the result in.',
  ],
  'domain-imports-client': [
    'Domain code that uses a database, HTTP or messaging client.',
    DOMAIN_WHY,
    'Move the client call into an adapter behind a port the domain declares.',
  ],
  'domain-imports-logger': [
    'Domain code that uses a logger.',
    'Logging from the domain ties its rules to a logging library and mixes reporting with decisions.',
    'Return the outcome, or raise a domain event, and log it in the calling layer.',
  ],
  'domain-imports-random': [
    'Domain code that draws random values or ids.',
    'Hidden randomness makes domain rules impossible to test exactly or to replay.',
    'Pass the id or a generator in from the caller.',
  ],
  'domain-imports-framework-context': [
    'Domain code that looks collaborators up in the framework container.',
    'A domain that asks the container for its dependencies hides them and cannot run without the framework.',
    'Take the collaborator as a constructor parameter.',
  ],
  'domain-reaches-io': [
    'Domain code that uses a project helper outside the domain whose own dependencies reach I/O, a client or a logger.',
    'A helper in between does not make the I/O go away; the domain still depends on it.',
    'Move the I/O behind a port the domain declares, or move the pure part of the helper into the domain.',
  ],
};
