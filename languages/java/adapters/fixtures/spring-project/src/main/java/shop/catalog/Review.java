package shop.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Version;

@Entity // violation: JpaEntityClass
public final class Review {
  @Id private Long id;
  @Version private long version;

  @ManyToOne(fetch = FetchType.LAZY)
  private Product product;

  Review() {}
}
