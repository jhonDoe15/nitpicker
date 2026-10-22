package shop.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.Enumerated;
import jakarta.persistence.EnumType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Transient;
import jakarta.persistence.Version;
import java.util.Objects;

@Entity
public class Customer {
  public enum Status {
    ACTIVE,
    BLOCKED
  }

  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;

  @Version private long version;

  private String email;

  private Status status; // violation: JpaEnumString

  @Enumerated
  private Status plain; // violation: JpaEnumString

  @Enumerated(EnumType.ORDINAL)
  private Status ordinal; // violation: JpaEnumString

  @Enumerated(EnumType.STRING)
  private Status tier;

  @Transient private Status cached;

  private static Status shared = Status.ACTIVE;

  protected Customer() {}

  @Override
  public boolean equals(Object other) {
    return other instanceof Customer customer && Objects.equals(id, customer.id);
  }

  @Override
  public int hashCode() {
    return Objects.hash(id); // violation: JpaIdentityHashCode
  }
}
