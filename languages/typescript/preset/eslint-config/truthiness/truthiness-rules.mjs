const TRUTHINESS_RULE = 'nitpicker/strict-boolean-expressions';

export const truthinessRuleOptions = {
  allowAny: true,
  allowNullableBoolean: true,
  allowNullableEnum: false,
  allowNullableNumber: false,
  allowNullableObject: true,
  allowNullableString: true,
  allowNumber: false,
  allowString: true,
};

export const truthinessRules = { [TRUTHINESS_RULE]: ['error', truthinessRuleOptions] };
