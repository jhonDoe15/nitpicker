package shop.rows;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

@Service
public class InvoiceReports {
  private final InvoiceRepository invoices;
  private final ReactiveInvoices reactive;

  public InvoiceReports(InvoiceRepository invoices, ReactiveInvoices reactive) {
    this.invoices = invoices;
    this.reactive = reactive;
  }

  public int count(String name) {
    return invoices.forCustomer(name).size(); // violation: SpringDataFilterInQuery
  }

  public boolean none(String name) {
    List<Invoice> rows = invoices.forCustomer(name);
    return rows.isEmpty(); // violation: SpringDataFilterInQuery
  }

  public long counted(Invoice.Status status) {
    return invoices.streamWith(status).count(); // violation: SpringDataFilterInQuery
  }

  public long byIds(List<Long> ids) {
    return invoices.findAllById(ids).stream().count(); // violation: SpringDataFilterInQuery
  }

  public long total(String name) {
    return invoices.forCustomer(name).stream().mapToLong(Invoice::getTotal).sum(); // violation: SpringDataFilterInQuery
  }

  public OptionalLong largest(String name) {
    return invoices.forCustomer(name).stream() // violation: SpringDataFilterInQuery
        .mapToLong(invoice -> invoice.getTotal())
        .max();
  }

  public Long reduced(String name) {
    return invoices.forCustomer(name).stream() // violation: SpringDataFilterInQuery
        .map(Invoice::getTotal)
        .reduce(0L, Long::sum);
  }

  public Map<Invoice.Status, Long> perStatus(String name) {
    return invoices.forCustomer(name).stream() // violation: SpringDataFilterInQuery
        .collect(Collectors.groupingBy(Invoice::getStatus, Collectors.counting()));
  }

  public Optional<Invoice> latest(String name) {
    return invoices.forCustomer(name).stream() // violation: SpringDataFilterInQuery
        .max(Comparator.comparing(Invoice::getDueOn));
  }

  public List<Invoice> sorted(String name) {
    return invoices.forCustomer(name).stream() // violation: SpringDataFilterInQuery
        .sorted(Comparator.comparing(Invoice::getDueOn).reversed())
        .toList();
  }

  public List<Invoice> sortedByLambda(String name) {
    return invoices.forCustomer(name).stream() // violation: SpringDataFilterInQuery
        .sorted((left, right) -> Long.compare(left.getTotal(), right.getTotal()))
        .toList();
  }

  public List<Invoice> open(String name) {
    return invoices.forCustomer(name).stream() // violation: SpringDataFilterInQuery
        .filter(invoice -> invoice.getStatus() == Invoice.Status.OPEN)
        .toList();
  }

  public boolean due(String name, LocalDate day) {
    return invoices.forCustomer(name).stream() // violation: SpringDataFilterInQuery
        .anyMatch(invoice -> invoice.getDueOn().isBefore(day));
  }

  public List<Invoice> paged(String name, Pageable page) {
    return invoices.pageFor(name, page).getContent().stream() // violation: SpringDataFilterInQuery
        .filter(invoice -> invoice.getTotal() > 0)
        .toList();
  }

  public Optional<Invoice> firstLarge(String name, long limit) {
    List<Invoice> rows = invoices.forCustomer(name);
    return rows.stream() // violation: SpringDataFilterInQuery
        .filter(invoice -> invoice.getTotal() > limit)
        .findFirst();
  }

  public List<Invoice> heldPage(String name, Pageable request) {
    Page<Invoice> page = invoices.pageFor(name, request);
    return page.getContent().stream() // violation: SpringDataFilterInQuery
        .filter(invoice -> invoice.getTotal() > 0)
        .toList();
  }

  public long parallel(String name) {
    return invoices.forCustomer(name).parallelStream() // violation: SpringDataFilterInQuery
        .filter(invoice -> invoice.getTotal() > 0)
        .count();
  }

  public Mono<Long> reactiveCount(String name) {
    return reactive.forCustomer(name).count(); // violation: SpringDataFilterInQuery
  }

  public Flux<Invoice> reactiveOpen(String name) {
    return reactive.forCustomer(name) // violation: SpringDataFilterInQuery
        .filter(invoice -> invoice.getStatus() == Invoice.Status.OPEN);
  }

  public Flux<Invoice> reactiveSorted(String name) {
    return reactive.forCustomer(name) // violation: SpringDataFilterInQuery
        .sort(Comparator.comparing(Invoice::getTotal));
  }
}
