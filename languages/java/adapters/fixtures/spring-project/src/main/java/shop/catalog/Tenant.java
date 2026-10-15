package shop.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Version;
import java.util.Objects;

@Entity
public class Tenant {
  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;

  @Version private long version;

  private String code;

  protected Tenant() {}

  public Long getId() {
    return id;
  }

  @Override
  public boolean equals(Object other) {
    return other instanceof Tenant tenant && id != null && Objects.equals(id, tenant.getId());
  }

  @Override
  public int hashCode() {
    return getId().hashCode(); // violation: JpaIdentityHashCode
  }
}
