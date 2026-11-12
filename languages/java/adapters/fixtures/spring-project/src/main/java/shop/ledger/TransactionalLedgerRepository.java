package shop.ledger;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;

@Transactional
public interface TransactionalLedgerRepository extends JpaRepository<Product, Long> {
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Product p set p.version = 0 where p.id = :id")
  int reset(@Param("id") Long id);

  long deleteByVersion(long version); // violation: SpringDataDerivedQuery
}
