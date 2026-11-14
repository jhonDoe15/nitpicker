function replacement(edit, fix) {
  if (edit.type === 'replace') {
    return {
      deletedRegion: { charOffset: edit.start, charLength: edit.end - edit.start },
      insertedContent: { text: edit.text },
    };
  }
  return {
    deletedRegion: { charOffset: 0, charLength: fix.textLength },
    insertedContent: { text: edit.text },
  };
}

function replaceable(fix) {
  return (
    Array.isArray(fix.edits) &&
    fix.edits.length > 0 &&
    fix.edits.every(({ type }) => type === 'replace' || fix.textLength !== undefined)
  );
}

export function sarifFixes(finding, artifactLocation) {
  const { fix } = finding;
  if (fix === undefined || !replaceable(fix)) {
    return {};
  }
  const paths = [...new Set(fix.edits.map(({ path }) => path))];
  return {
    fixes: [
      {
        description: { text: `Apply the ${fix.recipe} fix (${fix.safety}).` },
        artifactChanges: paths.map((name) => ({
          artifactLocation: artifactLocation(name),
          replacements: fix.edits
            .filter(({ path }) => path === name)
            .map((edit) => replacement(edit, fix)),
        })),
        properties: { recipe: fix.recipe, safety: fix.safety },
      },
    ],
  };
}
