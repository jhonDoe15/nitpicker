import { afterEach, describe, expect, it } from 'vitest';
import { project, removeProjects } from '../../test-support/spring-config-projects.mjs';
import { withoutReadOnlyReads } from './read-only-reads.mjs';

const SERVICE = 'src/main/java/shop/Reports.java';
const REPOSITORY = `package shop;

public interface ParcelRepository extends JpaRepository<Parcel, Long> {
  @Query("select count(p) from Parcel p where p.status = :status")
  int tally(@Param("status") String status);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Parcel p set p.status = 'LOST'; where p.id = :id")
  int lose(@Param("id") Long id);

  @Procedure("archive_parcels")
  int archive();

  int recount();

  default int retally() {
    return tally("SENT");
  }
}
`;
const KOTLIN_REPOSITORY = `package shop

interface CrateRepository : JpaRepository<Crate, Long> {
    @Query("select count(c) from Crate c")
    fun tally(): Int

    @Modifying
    @Query("update Crate c set c.version = 0")
    fun lose(): Int
}
`;
const CALLS = ['tally("SENT")', 'lose(1L)', 'archive()', 'recount()', 'retally()', 'save(parcel)'];

function service(receiver, type) {
  const lines = CALLS.map((call) => `    ${receiver}.${call};`);
  return `package shop;\n\nclass Reports {\n  private final ${type} ${receiver};\n\n  void run() {\n${lines.join('\n')}\n  }\n}\n`;
}

function kept(files, type, receiver) {
  const findings = CALLS.map((call, index) => ({
    tool: 'pmd',
    rule: 'SpringTransactionalReadOnlyWrite',
    path: SERVICE,
    location: { line: 7 + index, column: 5 },
    call,
  }));
  const other = { tool: 'pmd', rule: 'SpringMultiWriteWithoutTransaction', path: SERVICE };
  return withoutReadOnlyReads([...findings, other], {
    projectRoot: project({ ...files, [SERVICE]: service(receiver, type) }),
    roots: ['src/main/java', 'src/main/kotlin'],
  }).map((finding) => finding.call ?? finding.rule);
}

afterEach(removeProjects);

describe('read-only writes that call a repository query', () => {
  it('drops calls to @Query methods without @Modifying and keeps every other call', () => {
    const files = { 'src/main/java/shop/ParcelRepository.java': REPOSITORY };

    expect(kept(files, 'ParcelRepository', 'parcels')).toEqual([
      'lose(1L)',
      'archive()',
      'recount()',
      'retally()',
      'save(parcel)',
      'SpringMultiWriteWithoutTransaction',
    ]);
  });

  it('reads Kotlin repository interfaces too', () => {
    const files = { 'src/main/kotlin/shop/CrateRepository.kt': KOTLIN_REPOSITORY };

    expect(kept(files, 'CrateRepository', 'crates')).toEqual([
      'lose(1L)',
      'archive()',
      'recount()',
      'retally()',
      'save(parcel)',
      'SpringMultiWriteWithoutTransaction',
    ]);
  });

  it('keeps calls whose receiver type is not a project interface', () => {
    expect(kept({}, 'JdbcTemplate', 'jdbc')).toHaveLength(CALLS.length + 1);
  });
});

const ENTITY = 'package shop;\n\n@Entity\npublic class Parcel {\n  public String status;\n}\n';
const SUMMARY = 'package shop;\n\npublic class Summary {\n  public String status;\n}\n';
const CHANGES = [
  'parcel.setStatus("SEEN");',
  'parcel.status = "SEEN";',
  'summary.setStatus("SEEN");',
  'summary.status = "SEEN";',
  'this.parcels.tally("SENT");',
  'other.forEach(parcels::tally);',
];

function changed() {
  const body = CHANGES.map((line) => `    ${line}`).join('\n');
  const text = `package shop;\n\nclass Reports {\n  private final ParcelRepository parcels;\n\n  void run(Parcel parcel, Summary summary) {\n${body}\n  }\n}\n`;
  const findings = CHANGES.map((line, index) => ({
    tool: 'pmd',
    rule: 'SpringTransactionalReadOnlyWrite',
    path: SERVICE,
    location: { line: 7 + index, column: line.startsWith('other') ? 19 : 5 },
    line,
  }));
  return withoutReadOnlyReads(findings, {
    projectRoot: project({
      'src/main/java/shop/ParcelRepository.java': REPOSITORY,
      'src/main/java/shop/Parcel.java': ENTITY,
      'src/main/java/shop/Summary.java': SUMMARY,
      [SERVICE]: text,
    }),
    roots: ['src/main/java'],
  }).map((finding) => finding.line);
}

describe('read-only writes that change a loaded object', () => {
  it('keeps changes to an entity and drops changes to a project class without @Entity', () => {
    expect(changed()).toEqual(['parcel.setStatus("SEEN");', 'parcel.status = "SEEN";']);
  });
});
