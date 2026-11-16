package shop.rows;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Transient;
import jakarta.persistence.Version;
import java.time.LocalDate;

@Entity
public class Invoice {
  public enum Status {
    OPEN,
    PAID
  }

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;

  @Version private long version;

  @Enumerated(EnumType.STRING)
  private Status status;

  private long total;

  private LocalDate dueOn;

  private String customerName;

  @Transient private long reminders;

  protected Invoice() {}

  public Status getStatus() {
    return status;
  }

  public long getTotal() {
    return total;
  }

  public LocalDate getDueOn() {
    return dueOn;
  }

  public String getCustomerName() {
    return customerName;
  }

  public long getReminders() {
    return reminders;
  }

  public boolean isOverdue() {
    return status == Status.OPEN && dueOn.isBefore(LocalDate.now());
  }
}
