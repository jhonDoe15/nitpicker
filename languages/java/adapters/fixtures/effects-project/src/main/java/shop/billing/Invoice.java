package shop.billing;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.NamedAttributeNode;
import jakarta.persistence.NamedEntityGraph;
import jakarta.persistence.OneToMany;
import java.util.List;
import org.hibernate.annotations.BatchSize;
import org.hibernate.annotations.Fetch;
import org.hibernate.annotations.FetchMode;

@Entity
@NamedEntityGraph(name = "Invoice.lines", attributeNodes = @NamedAttributeNode("lines"))
public class Invoice {
  @Id private Long id;

  @ManyToOne(fetch = FetchType.LAZY)
  private Customer customer;

  @ManyToOne private Customer payer;

  @ManyToOne(fetch = FetchType.LAZY)
  private Account account;

  @OneToMany(mappedBy = "invoice")
  private List<InvoiceLine> lines;

  @OneToMany(mappedBy = "invoice")
  @BatchSize(size = 50)
  private List<InvoiceLine> credits;

  @OneToMany(mappedBy = "invoice")
  @Fetch(FetchMode.SUBSELECT)
  private List<InvoiceLine> notes;

  public Long getId() {
    return id;
  }

  public Customer getCustomer() {
    return customer;
  }

  public Customer getPayer() {
    return payer;
  }

  public Account getAccount() {
    return account;
  }

  public List<InvoiceLine> getLines() {
    return lines;
  }

  public List<InvoiceLine> getCredits() {
    return credits;
  }

  public List<InvoiceLine> getNotes() {
    return notes;
  }
}
