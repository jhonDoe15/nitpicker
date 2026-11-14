import { afterEach, describe, expect, it } from 'vitest';
import { project, removeProjects } from '../test-support/spring-config-projects.mjs';
import { dropComputedReads } from './persistent-reads.mjs';

const ENTITY = 'src/main/java/shop/Invoice.java';
const BASE = 'src/main/java/shop/Audited.java';
const SERVICE = 'src/main/java/shop/Reports.java';
const ENTITY_SOURCE = `package shop;

@jakarta.persistence.Entity
@Table(name = "invoices", indexes = @Index(columnList = "status"))
public class Invoice extends Audited {
  public enum Status { OPEN, PAID }

  @Id @GeneratedValue private Long id;
  @Enumerated(EnumType.STRING) private Status status;
  private long total, tax;
  private boolean archived;
  @ManyToOne(fetch = FetchType.LAZY) private Customer customer;
  private java.util.Set<String> tags = new java.util.HashSet<>(java.util.List.of("a"));
  @Transient private long reminders;
  private transient long cached;
  private static final long LIMIT = 10;

  public Status getStatus() { return status; }
  public long getTotal() { return total; }
  public boolean isArchived() { return archived; }
  public Customer getCustomer() { return customer; }
  public long getReminders() { return reminders; }
  public long getCached() { return cached; }
  public boolean isOverdue() { return status == Status.OPEN; }
  public String getLabel() { return status.name(); }
}
`;
const BASE_SOURCE = `package shop;

@MappedSuperclass
public abstract class Audited {
  private java.time.Instant createdAt;
  public java.time.Instant getCreatedAt() { return createdAt; }
}
`;
const CUSTOMER_SOURCE = `package shop;

@Entity
public class Customer {
  @Id private Long id;
  private String name;
  private String label;
}
`;
const LINES = [
  'rows.forCustomer(n).stream().filter(i -> i.getStatus() == Status.OPEN).toList();',
  'rows.forCustomer(n).stream().filter(i -> i.isOverdue()).toList();',
  'rows.forCustomer(n).stream().mapToLong(Invoice::getReminders).sum();',
  'rows.forCustomer(n).stream().mapToLong(shop.Invoice::getTotal).sum();',
  'rows.forCustomer(n).stream().filter(i -> i.getCustomer().getName().equals(n)).toList();',
  'rows.forCustomer(n).stream().sorted((a, b) -> a.getCreatedAt().compareTo(b.getCached())).toList();',
  'rows.forCustomer(n).stream().filter(Invoice::isArchived).count();',
  'rows.forCustomer(n).size();',
  'rows.forCustomer(n).stream().filter(String::isBlank).toList();',
  'rows.forCustomer(n).collectList().map(all -> all.isEmpty());',
  'rows.forCustomer(n).stream().filter(i -> i.getTags().contains(n)).count();',
  'rows.findAll().stream().filter(p -> p.hashCode() > 0).count();',
  'rows.forCustomer(n).stream().filter(i -> i.getLabel().equals(n)).count();',
  'rows.findAll().stream().filter(i -> i.isOverdue()).count();',
  'rows.forCustomer(n).stream().filter(i -> i.getTax() > 0).map(Invoice::getLabel).toList();',
  'loaded.stream().filter(i -> i.isOverdue()).count();',
];
const SERVICE_SOURCE = `package shop;\n\nclass Reports { List<Invoice> loaded = rows.findAll();\n${LINES.map((line) => `  ${line}`).join('\n')}\n}\n`;

afterEach(removeProjects);

function kept(files) {
  const findings = LINES.map((_, index) => ({
    tool: 'pmd',
    rule: 'SpringDataFilterInQuery',
    path: SERVICE,
    location: { line: index + 4, column: 3 },
  }));
  return dropComputedReads(
    [...findings, { tool: 'pmd', rule: 'SpringDataNoFlush', path: SERVICE, location: { line: 5 } }],
    { projectRoot: project(files), roots: ['src/main/java'] },
  ).map(({ rule, location }) => `${rule}:${String(location.line - 3)}`);
}

describe('rows read through computed or transient properties', () => {
  it('keeps column reads, drops computed, transient and unknown ones, and leaves findAll() alone', () => {
    expect(
      kept({
        [ENTITY]: ENTITY_SOURCE,
        [BASE]: BASE_SOURCE,
        'src/main/java/shop/Customer.java': CUSTOMER_SOURCE,
        [SERVICE]: SERVICE_SOURCE,
      }),
    ).toEqual([
      'SpringDataFilterInQuery:1',
      'SpringDataFilterInQuery:4',
      'SpringDataFilterInQuery:5',
      'SpringDataFilterInQuery:7',
      'SpringDataFilterInQuery:8',
      'SpringDataFilterInQuery:10',
      'SpringDataFilterInQuery:11',
      'SpringDataFilterInQuery:12',
      'SpringDataFilterInQuery:14',
      'SpringDataFilterInQuery:15',
      'SpringDataFilterInQuery:16',
      'SpringDataNoFlush:2',
    ]);
  });

  it('drops every finding that reads a property when no entity source declares it', () => {
    expect(kept({ [SERVICE]: SERVICE_SOURCE })).toEqual([
      'SpringDataFilterInQuery:8',
      'SpringDataFilterInQuery:10',
      'SpringDataFilterInQuery:12',
      'SpringDataFilterInQuery:14',
      'SpringDataFilterInQuery:16',
      'SpringDataNoFlush:2',
    ]);
  });
});
