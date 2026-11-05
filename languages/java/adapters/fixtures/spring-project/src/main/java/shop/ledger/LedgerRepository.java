package shop.ledger;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import shop.catalog.Product;

public interface LedgerRepository extends JpaRepository<Product, Long> {
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Product p set p.version = 0 where p.id = :id")
  int reset(@Param("id") Long id); // violation: SpringDataWriteWithoutTransaction

  @Transactional
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("delete from Product p where p.id in :ids")
  int purge(@Param("ids") List<Long> ids);

  long deleteByVersion(long version); // violation: SpringDataDerivedQuery, SpringDataWriteWithoutTransaction

  List<Product> removeAllByVersion(long version); // violation: SpringDataDerivedQuery, SpringDataWriteWithoutTransaction

  @Override
  void deleteById(Long id);

  @Query("select p from Product p where p.version > :version")
  List<Product> updatedSince(@Param("version") long version);

  @Query("select p from Product p where p.version = :version")
  List<Product> deleteCandidates(@Param("version") long version);
}
