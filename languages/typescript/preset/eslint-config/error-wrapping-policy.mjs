// Classified wrappers that intentionally sanitize external failures retain their bounded contract
// by listing `classificationIndex` and `unclassifiedValue`; only unclassified wrappers must carry
// the original diagnostic cause.
export const errorWrappingPolicy = {
  wrappers: [{ name: 'Error', optionsIndex: 1 }],
};
