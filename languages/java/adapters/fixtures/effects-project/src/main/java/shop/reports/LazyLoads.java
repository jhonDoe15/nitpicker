package shop.reports;

import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import shop.billing.Invoice;
import shop.billing.InvoiceRepository;

public class LazyLoads {
  private final InvoiceRepository invoices;
  private final EntityManager entityManager;

  public LazyLoads(InvoiceRepository invoices, EntityManager entityManager) {
    this.invoices = invoices;
    this.entityManager = entityManager;
  }

  public List<String> customerNames() {
    List<String> names = new ArrayList<>();
    for (Invoice invoice : invoices.findAll()) {
      names.add(invoice.getCustomer().getName());
    }
    return names;
  }

  public List<Integer> lineCounts() {
    return invoices.findFrom(10L).stream().map(invoice -> invoice.getLines().size()).toList();
  }

  public int linesFromQuery() {
    List<Invoice> found =
        entityManager.createQuery("select i from Invoice i", Invoice.class).setMaxResults(50).getResultList();
    int count = 0;
    for (int index = 0; index < found.size(); index++) {
      count += found.get(index).getLines().size();
    }
    return count;
  }

  public List<String> namesNextToFetchedLines() {
    List<String> names = new ArrayList<>();
    for (Invoice invoice : invoices.findWithLines()) {
      if (!invoice.getLines().isEmpty()) {
        names.add(invoice.getCustomer().getName());
      }
    }
    return names;
  }
}
