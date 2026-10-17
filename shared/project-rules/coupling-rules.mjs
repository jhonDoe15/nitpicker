export function couplingRules(ids, { everyLanguage, javaOnly }) {
  return [
    {
      id: ids.stabilityDirection,
      check: 'coupling',
      limit:
        'a package depending on a less stable package; an import that exists only for the type checker (`import type`, `if TYPE_CHECKING:`) is never the reported dependency, but still counts toward instability',
      enforcedBy: everyLanguage,
    },
    {
      id: ids.packageCycle,
      check: 'coupling',
      limit: 'packages that depend on each other in a loop',
      enforcedBy: javaOnly,
    },
  ];
}
