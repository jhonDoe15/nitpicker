import { describe, expect, it } from 'vitest';
import { detectConventions } from '../../../../../shared/conventions/detect.mjs';
import { SOFT_DELETE_FILTERS_CONVENTION, softDeleteFilterEntries } from './soft-delete-filters.mts';

const accepts = (_definition, file) => !/\.test\.|^test\//u.test(file);

function detect(files) {
  const source = {
    paths: () => Object.keys(files),
    readMany: (paths) => new Map(paths.map((file) => [file, files[file]])),
  };
  return detectConventions({ definitions: [SOFT_DELETE_FILTERS_CONVENTION], source, accepts })[
    SOFT_DELETE_FILTERS_CONVENTION.id
  ];
}

const guarded = (n) =>
  `export async function f${String(n)}(db) { return db.selectFrom('asset').where('asset.deletedAt', 'is', null).execute(); }\n`;
const unguarded = (n) =>
  `export async function g${String(n)}(db) { return db.selectFrom('asset').where('asset.id', '=', 1).execute(); }\n`;
const helped = (n) =>
  `export async function h${String(n)}(db) { return db.selectFrom('asset').$call(withDefaultVisibility).execute(); }\n`;

function project(good, bad, make = guarded) {
  const goodFiles = Array.from({ length: good }, (_, index) => [
    `src/good-${String(index)}.ts`,
    make(index),
  ]);
  const badFiles = Array.from({ length: bad }, (_, index) => [
    `src/bad-${String(index)}.ts`,
    unguarded(index),
  ]);
  return Object.fromEntries([...goodFiles, ...badFiles]);
}

describe('typescript.softDeleteFilters', () => {
  it('leaves a table alone when the ORM filters soft-deleted rows itself', () => {
    const files = project(8, 2);
    files['src/asset.entity.ts'] = 'class Asset { @DeleteDateColumn() deletedAt: Date; }\n';
    expect(detect(files).choice).toEqual([]);
    files['src/asset.entity.ts'] =
      'const Asset = sequelize.define("Asset", {}, { paranoid: true });\n';
    expect(detect(files).choice).toEqual([]);
  });

  it('does not count a status value or a message as a filter', () => {
    const files = project(10, 1);
    files['src/status.ts'] =
      "export const f = (db) => db.selectFrom('asset').where('status', '=', 'archived').execute();\n";
    expect(detect(files).choice).toEqual(['asset__deletedAt']);
  });

  it('follows the column that 80% of the reads of a table apply', () => {
    expect(detect(project(8, 2)).choice).toEqual(['asset__deletedAt']);
  });

  it('follows a helper that most reads of a table call', () => {
    expect(detect(project(9, 1, helped)).choice).toEqual(['asset__helper__withDefaultVisibility']);
  });

  it('stays silent below the threshold', () => {
    expect(detect(project(7, 3)).choice).toEqual([]);
  });

  it('stays silent for a table with too few reads', () => {
    expect(detect(project(3, 0)).choice).toEqual([]);
  });

  it('does not count reads in test files', () => {
    const files = { ...project(8, 2), 'src/a.test.ts': guarded(1).repeat(20) };

    expect(detect(files).choice).toEqual(['asset__deletedAt']);
    expect(detect({ 'src/a.test.ts': guarded(1).repeat(20) }).choice).toEqual([]);
  });

  it('counts a read once per file and ordinal, so many reads in one file add up', () => {
    const many = Array.from({ length: 10 }, (_, index) => guarded(index)).join('');

    expect(detect({ 'src/all.ts': many }).choice).toEqual(['asset__deletedAt']);
  });

  it('reads the followed entries for the rule options', () => {
    expect(
      softDeleteFilterEntries({ 'typescript.softDeleteFilters': ['asset__deletedAt'] }),
    ).toEqual(['asset__deletedAt']);
    expect(softDeleteFilterEntries({})).toEqual([]);
  });
});
