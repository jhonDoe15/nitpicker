type ClassEntry = {
  readonly name: string;
  readonly file: string;
  readonly extends?: string | undefined;
};

type FileEntry = { readonly package: string; readonly imports: readonly string[] };

type ClassReport = {
  readonly classes: readonly ClassEntry[];
  readonly files: Readonly<Record<string, FileEntry>>;
};

type ClassIndex = ReadonlyMap<string, ClassEntry>;

export function inheritanceDepths(report: ClassReport): Map<ClassEntry, number> {
  const byName = new Map(
    report.classes.map((entry) => [fullName(fileOf(report, entry), entry), entry]),
  );
  return new Map(
    report.classes.map((entry) => [
      entry,
      depthOf(entry, (child) => resolve(report, byName, child)),
    ]),
  );
}

function depthOf(
  entry: ClassEntry,
  parentOf: (child: ClassEntry) => ClassEntry | undefined,
): number {
  const chain = [entry];
  for (const current of chain) {
    const parent = current.extends === undefined ? undefined : parentOf(current);
    if (parent !== undefined && !chain.includes(parent)) {
      chain.push(parent);
    }
  }
  return chain.filter((link) => link.extends !== undefined).length;
}

function fileOf(report: ClassReport, entry: ClassEntry): FileEntry {
  return report.files[entry.file] ?? { package: '', imports: [] };
}

function fullName(file: FileEntry, entry: { readonly name: string }): string {
  return file.package === '' ? entry.name : `${file.package}.${entry.name}`;
}

function resolve(
  report: ClassReport,
  byName: ClassIndex,
  entry: ClassEntry,
): ClassEntry | undefined {
  const file = fileOf(report, entry);
  const written = entry.extends ?? '';
  const [first = '', ...rest] = written.split('.');
  const suffix = rest.length === 0 ? '' : `.${rest.join('.')}`;
  const candidates = [
    ...enclosing(entry.name).map((owner) => fullName(file, { name: `${owner}.${written}` })),
    ...file.imports.filter((name) => name.endsWith(`.${first}`)).map((name) => `${name}${suffix}`),
    fullName(file, { name: written }),
    ...file.imports
      .filter((name) => name.endsWith('.*'))
      .map((name) => `${name.slice(0, -1)}${written}`),
    written,
  ];
  return candidates.map((name) => byName.get(name)).find((found) => found !== undefined);
}

function enclosing(name: string): string[] {
  const parts = name.split('.');
  return parts.map((_, index) => parts.slice(0, parts.length - index).join('.'));
}
