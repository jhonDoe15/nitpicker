const BEAN_VALIDATION = [
  'AssertFalse',
  'AssertTrue',
  'DecimalMax',
  'DecimalMin',
  'Digits',
  'Email',
  'Future',
  'FutureOrPresent',
  'Max',
  'Min',
  'Negative',
  'NegativeOrZero',
  'NotBlank',
  'NotEmpty',
  'NotNull',
  'Null',
  'Past',
  'PastOrPresent',
  'Pattern',
  'Positive',
  'PositiveOrZero',
  'Size',
];
const HIBERNATE_VALIDATOR = [
  'CodePointLength',
  'CreditCardNumber',
  'Currency',
  'EAN',
  'ISBN',
  'Length',
  'LuhnCheck',
  'Mod10Check',
  'Mod11Check',
  'Normalized',
  'ParameterScriptAssert',
  'Range',
  'URL',
  'UUID',
  'ScriptAssert',
  'UniqueElements',
];
const HIBERNATE_TIME = ['DurationMax', 'DurationMin'];

export const CONSTRAINT_NAMES = {
  'jakarta.validation.constraints': BEAN_VALIDATION,
  'javax.validation.constraints': BEAN_VALIDATION,
  'org.hibernate.validator.constraints': HIBERNATE_VALIDATOR,
  'org.hibernate.validator.constraints.time': HIBERNATE_TIME,
};

export const CONSTRAINT_TYPES = Object.entries(CONSTRAINT_NAMES).flatMap(([prefix, names]) =>
  names.map((name) => `${prefix}.${name}`),
);

export const BODY_STATUS = {
  constrained: 'constrained',
  unconstrained: 'unconstrained',
  unresolved: 'unresolved',
};
