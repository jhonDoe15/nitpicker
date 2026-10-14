package shop.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

@Entity // violation: JpaVersion
public class Supplier {
  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;

  protected Supplier() {}
}
