export type FsTwin = {
  readonly name: string;
  readonly maxArguments: number;
  readonly takesDescriptor: boolean;
  readonly hasEntryOption: boolean;
};

const PATH_ONLY = { takesDescriptor: false, hasEntryOption: false };
const DESCRIPTOR = { takesDescriptor: true, hasEntryOption: false };
const ENTRY = { takesDescriptor: false, hasEntryOption: true };

function twin(
  name: string,
  maxArguments: number,
  flags: Pick<FsTwin, 'takesDescriptor' | 'hasEntryOption'>,
): FsTwin {
  return { name, maxArguments, ...flags };
}

export const FS_TWINS: ReadonlyMap<string, FsTwin> = new Map([
  ['readFileSync', twin('readFile', 2, DESCRIPTOR)],
  ['writeFileSync', twin('writeFile', 3, DESCRIPTOR)],
  ['appendFileSync', twin('appendFile', 3, DESCRIPTOR)],
  ['readdirSync', twin('readdir', 2, PATH_ONLY)],
  ['mkdirSync', twin('mkdir', 2, PATH_ONLY)],
  ['rmSync', twin('rm', 2, PATH_ONLY)],
  ['renameSync', twin('rename', 2, PATH_ONLY)],
  ['copyFileSync', twin('copyFile', 3, PATH_ONLY)],
  ['statSync', twin('stat', 2, ENTRY)],
  ['lstatSync', twin('lstat', 2, ENTRY)],
  ['unlinkSync', twin('unlink', 1, PATH_ONLY)],
  ['accessSync', twin('access', 2, PATH_ONLY)],
  ['chmodSync', twin('chmod', 2, PATH_ONLY)],
  ['mkdtempSync', twin('mkdtemp', 2, PATH_ONLY)],
  ['realpathSync', twin('realpath', 2, PATH_ONLY)],
]);

export const ACCESS_TWIN: FsTwin = twin('access', 1, PATH_ONLY);

export const FS_EXTRA_TWINS: ReadonlyMap<string, FsTwin> = new Map([
  ['ensureDirSync', twin('ensureDir', 2, PATH_ONLY)],
  ['mkdirsSync', twin('mkdirs', 2, PATH_ONLY)],
  ['mkdirpSync', twin('mkdirp', 2, PATH_ONLY)],
  ['ensureFileSync', twin('ensureFile', 1, PATH_ONLY)],
  ['copySync', twin('copy', 3, PATH_ONLY)],
  ['moveSync', twin('move', 3, PATH_ONLY)],
  ['removeSync', twin('remove', 1, PATH_ONLY)],
  ['emptyDirSync', twin('emptyDir', 1, PATH_ONLY)],
  ['outputFileSync', twin('outputFile', 3, PATH_ONLY)],
  ['readJsonSync', twin('readJson', 2, PATH_ONLY)],
  ['writeJsonSync', twin('writeJson', 3, PATH_ONLY)],
  ['outputJsonSync', twin('outputJson', 3, PATH_ONLY)],
  ['pathExistsSync', twin('pathExists', 1, PATH_ONLY)],
  ['existsSync', twin('pathExists', 1, PATH_ONLY)],
]);
