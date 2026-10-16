export function reuseRules(ids, enforcedBy) {
  return [
    {
      id: ids.sharedUsedByOneFeature,
      check: 'coupling',
      limit: 'a module in `main/shared/` that exactly one feature reaches and nothing else uses',
      enforcedBy,
    },
    {
      id: ids.duplicateDefinition,
      check: 'structure',
      limit:
        'a used literal `const`, function or `type` with one name and text in two modules of a package',
      enforcedBy,
    },
    {
      id: ids.exportedNameCollision,
      check: 'structure',
      limit:
        'two different exports with one name that a module imports both of, keeping the name for one',
      enforcedBy,
    },
    {
      id: ids.redefinedLibraryComponent,
      check: 'structure',
      limit: 'React only: a component named like one the project renders from a dependency',
      enforcedBy,
    },
    {
      id: ids.newIconAsset,
      check: 'structure',
      limit: 'React only: a new icon-sized `.svg` file while an icon package is a dependency',
      enforcedBy,
    },
  ];
}
