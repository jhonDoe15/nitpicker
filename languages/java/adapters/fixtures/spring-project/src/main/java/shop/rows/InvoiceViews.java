package shop.rows;

import java.util.Comparator;
import java.util.List;
import java.util.function.Predicate;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service
public class InvoiceViews {
  private static final Comparator<Invoice> BY_DUE = Comparator.comparing(Invoice::getDueOn);

  private final InvoiceRepository invoices;
  private final Predicate<Invoice> visible;

  public InvoiceViews(InvoiceRepository invoices, Predicate<Invoice> visible) {
    this.invoices = invoices;
    this.visible = visible;
  }

  public long counted(String name) {
    return invoices.countFor(name);
  }

  public List<String> names(String name) {
    return invoices.forCustomer(name).stream().map(Invoice::getCustomerName).toList();
  }

  public List<Invoice> allowed(String name) {
    return invoices.forCustomer(name).stream().filter(visible).toList();
  }

  public List<Invoice> checked(String name) {
    return invoices.forCustomer(name).stream().filter(invoice -> visible.test(invoice)).toList();
  }

  public List<Invoice> held(String name) {
    List<Invoice> rows = invoices.forCustomer(name);
    if (rows.isEmpty()) {
      return List.of();
    }
    return rows;
  }

  public List<Invoice> sortedByConstant(String name) {
    return invoices.forCustomer(name).stream().sorted(BY_DUE).toList();
  }

  public List<Invoice> pageSorted(String name, Pageable page) {
    return invoices.pageFor(name, page).getContent().stream()
        .sorted(Comparator.comparing(Invoice::getDueOn))
        .toList();
  }

  public int pageSize(String name, Pageable page) {
    return invoices.pageFor(name, page).getContent().size();
  }

  public List<Invoice> topByDue(Limit limit) {
    return invoices.largest(limit).stream().sorted(Comparator.comparing(Invoice::getDueOn)).toList();
  }

  public List<String> shortNames() {
    return invoices.customerNames().stream().filter(name -> name.length() < 10).toList();
  }

  public List<Invoice> saved(List<Invoice> incoming) {
    return invoices.saveAll(incoming).stream().filter(invoice -> invoice.getTotal() > 0).toList();
  }
}
