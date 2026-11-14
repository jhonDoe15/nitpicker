package shop.entries;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Transient;
import jakarta.persistence.Version;
import java.time.Instant;

@Entity
public class Entry {
  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;

  @Version private long version;

  private String account;

  private long amount;

  private Instant bookedAt;

  @Transient private long pending;

  protected Entry() {}

  public String getAccount() {
    return account;
  }

  public long getAmount() {
    return amount;
  }

  public Instant getBookedAt() {
    return bookedAt;
  }

  public long getPending() {
    return pending;
  }

  public boolean isCredit() {
    return amount > 0;
  }
}
