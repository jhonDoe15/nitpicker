package shop.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

@Entity // violation: JpaEntityClass
@Table(indexes = @Index(columnList = "product_ref, created_at"))
public final class Review {
  @Id private Long id;
  @Version private long version;

  @ManyToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "product_ref")
  private Product product;

  Review() {}
}
