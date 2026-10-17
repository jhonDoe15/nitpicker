import { hidingSets } from './hiding.mjs';

const LISTED_FILES = 3;
const REASONS = {
  unhidden: 'where the base config checked it',
  dormant: 'where the base hid no code',
  imported: 'that production code imports',
};

function isAddedOrMoved(file, scope) {
  const basePath = scope.basePathOf(file);
  return basePath !== file || !scope.existsInBase(file);
}

function reasonFor(set, file, scope) {
  const hiders = set.baseHiders(scope.basePathOf(file));
  if (hiders.length === 0) {
    return 'unhidden';
  }
  if (!scope.baseCode.some((baseFile) => hiders.some((hides) => hides(baseFile)))) {
    return 'dormant';
  }
  return set.importable && scope.productionReach().has(file) ? 'imported' : undefined;
}

function listed(entries, limit) {
  const more = entries.length > limit ? `, and ${entries.length - limit} more` : '';
  return `${entries.slice(0, limit).join(', ')}${more}`;
}

function loosening({ label, reason, files }, scope) {
  const entries =
    reason === 'imported'
      ? files.map((file) => `${file} (imported by ${scope.productionReach().get(file)})`)
      : files;
  function describe(limit) {
    return `${label} hide code this change adds or moves ${REASONS[reason]}: ${listed(entries, limit)}`;
  }
  return { text: describe(LISTED_FILES), key: describe(entries.length), files };
}

export function hiddenCodeChanges(baseConfig, headConfig, scope) {
  const changedCode = scope.code.filter((file) => isAddedOrMoved(file, scope)).toSorted();
  const loosened = hidingSets(baseConfig, headConfig, scope).flatMap((set) => {
    const byReason = Map.groupBy(
      changedCode.filter((file) => set.hidesInHead(file)),
      (file) => reasonFor(set, file, scope),
    );
    return Object.keys(REASONS)
      .filter((reason) => byReason.has(reason))
      .map((reason) => loosening({ label: set.label, reason, files: byReason.get(reason) }, scope));
  });
  return { loosened, changed: [] };
}
