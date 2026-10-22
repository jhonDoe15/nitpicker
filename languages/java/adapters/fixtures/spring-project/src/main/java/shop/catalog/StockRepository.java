package shop.catalog;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StockRepository extends JpaRepository<Product, Long> {
  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Product p set p.version = 0 where p.id = :id")
  void touch(@Param("id") Long id);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Product p set p.version = 0 where p.id in :ids")
  int touchAll(@Param("ids") List<Long> ids);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("update Product p set p.version = p.version + 1 where p.id = :id")
  int markSold(@Param("id") Long id);

  @Query("select count(p) from Product p where p.version = :version")
  int countVersion(@Param("version") long version);
}
