package shop.catalog;

import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.MappedSuperclass;

@MappedSuperclass // violation: JpaVersion
public abstract class Identified {
  @Id
  @GeneratedValue(strategy = GenerationType.SEQUENCE)
  private Long id;
}
