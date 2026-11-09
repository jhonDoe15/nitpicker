package shop.catalog;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderColumn;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Entity
@Table(indexes = @Index(columnList = "preferred_supplier_id"))
public class Product {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY) // violation: JpaSequenceIds
  private Long id;

  @Version private long version;

  @ManyToOne private Supplier supplier; // violation: JpaLazyFetching, JpaUnindexedForeignKey

  @ManyToOne(fetch = FetchType.EAGER) // violation: JpaLazyFetching
  private Supplier backupSupplier; // violation: JpaUnindexedForeignKey

  @ManyToOne(fetch = FetchType.LAZY)
  private Supplier preferredSupplier;

  @OneToMany(mappedBy = "product", fetch = FetchType.EAGER) // violation: JpaLazyFetching
  private Set<Review> reviews = new HashSet<>();

  @ManyToMany(cascade = CascadeType.ALL) // violation: JpaManyToManyCascade
  private Set<Tag> tags = new HashSet<>();

  @ManyToMany(cascade = {CascadeType.PERSIST, CascadeType.MERGE})
  private Set<Tag> labels = new HashSet<>();

  @ManyToMany private List<Tag> badges = new ArrayList<>(); // violation: JpaManyToManySet

  @ManyToMany @OrderColumn private List<Tag> rankedBadges = new ArrayList<>();

  protected Product() {}
}
