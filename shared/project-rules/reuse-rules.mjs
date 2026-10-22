export function reuseRules(ids, reactEnforcedBy) {
  return [
    {
      id: ids.sharedUsedByOneFeature,
      check: 'coupling',
      limit:
        'a module under a shared root (`layout.sharedRoots`) that exactly one feature reaches and nothing else uses',
    },
    {
      id: ids.duplicateDefinition,
      check: 'structure',
      limit:
        'a used literal `const`, function or `type` with one name and text in two modules of a package',
    },
    {
      id: ids.siblingCopyEdit,
      check: 'structure',
      limit:
        'a function or class edited so that it drifts from its same-named copy in another module of the package, at least 80% the same tokens before and after, while that copy is left unedited',
    },
    {
      id: ids.exportedNameCollision,
      check: 'structure',
      limit:
        'two different exports with one name that a module imports both of, keeping the name for one',
    },
    {
      id: ids.redefinedLibraryComponent,
      check: 'structure',
      limit: 'React only: a component named like one the project renders from a dependency',
      enforcedBy: { ...reactEnforcedBy, javascript: 'partial' },
    },
    {
      id: ids.newIconAsset,
      check: 'structure',
      limit: 'React only: a new icon-sized `.svg` file while an icon package is a dependency',
      enforcedBy: reactEnforcedBy,
    },
  ];
}
