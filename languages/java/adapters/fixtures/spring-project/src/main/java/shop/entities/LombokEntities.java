package shop.entities;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Version;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Data
class Ledger {
  @Id @GeneratedValue private Long id;
  @Version private long version;

  @Override
  public boolean equals(Object other) {
    return other instanceof Ledger ledger && id != null && id.equals(ledger.id);
  }

  @Override
  public int hashCode() {
    return getClass().hashCode();
  }
}

@Entity
@EqualsAndHashCode(of = "id") // violation: JpaIdentityHashCode
class Bin {
  @Id @GeneratedValue private Long id;
  @Version private long version;
}

@Entity
@EqualsAndHashCode(onlyExplicitlyIncluded = true) // violation: JpaIdentityHashCode
class Shelf {
  @Id @GeneratedValue @EqualsAndHashCode.Include private Long id;
  @Version private long version;
}

@Entity
@EqualsAndHashCode(onlyExplicitlyIncluded = true)
class Crate {
  @Id @GeneratedValue private Long id;
  @Version private long version;
  @EqualsAndHashCode.Include private String code;
}

@Entity
@EqualsAndHashCode(callSuper = false) // violation: JpaIdentityHashCode
class Pallet {
  @Id @GeneratedValue private Long id;
  @Version private long version;
}
