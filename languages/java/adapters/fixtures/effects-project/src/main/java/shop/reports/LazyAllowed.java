package shop.reports;

import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import shop.billing.Invoice;
import shop.billing.InvoiceRepository;

public class LazyAllowed {
  private final InvoiceRepository invoices;
  private final EntityManager entityManager;

  public LazyAllowed(InvoiceRepository invoices, EntityManager entityManager) {
    this.invoices = invoices;
    this.entityManager = entityManager;
  }

  public int fetchedInQuery() {
    int count = 0;
    for (Invoice invoice : invoices.findWithLines()) {
      count += invoice.getLines().size();
    }
    return count;
  }

  public List<String> fetchedByGraph(Long payerId) {
    return invoices.findByPayerId(payerId).stream().map(invoice -> invoice.getCustomer().getName()).toList();
  }

  public int fetchedByNamedGraph(Long customerId) {
    int count = 0;
    for (Invoice invoice : invoices.findByCustomerId(customerId)) {
      count += invoice.getLines().size();
    }
    return count;
  }

  public int fetchedInJpql() {
    int count = 0;
    for (Invoice invoice :
        entityManager
            .createQuery("select i from Invoice i join fetch i.lines", Invoice.class)
            .getResultList()) {
      count += invoice.getLines().size();
    }
    return count;
  }

  public List<Object> identifiersAndBatches() {
    List<Object> values = new ArrayList<>();
    for (Invoice invoice : invoices.findAll()) {
      values.add(invoice.getCustomer().getId());
      values.add(invoice.getCredits().size());
      values.add(invoice.getNotes().size());
      values.add(invoice.getAccount().getNumber());
      values.add(invoice.getPayer().getName());
    }
    return values;
  }

  public int fromParameter(List<Invoice> given) {
    int count = 0;
    for (Invoice invoice : given) {
      count += invoice.getLines().size();
    }
    return count;
  }

  public BigDecimal projected() {
    BigDecimal sum = BigDecimal.ZERO;
    for (InvoiceRepository.Total total : invoices.findTotalsBy()) {
      sum = sum.add(total.getAmount());
    }
    return sum;
  }
}
