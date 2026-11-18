package shop.trash;

import java.math.BigDecimal;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProductRepository extends JpaRepository<Product, Long> {
  List<Product> findBySkuAndDeletedAtIsNull(String sku);

  List<Product> findByOwnerAndDeletedAtIsNull(String owner);

  List<Product> findByIdInAndDeletedAtIsNull(List<Long> ids);

  List<Product> findBySkuStartingWithAndDeletedAtIsNull(String prefix);

  List<Product> findBySkuEndingWithAndDeletedAtIsNull(String suffix);

  List<Product> findBySkuContainingAndDeletedAtIsNull(String part);

  long countByOwnerAndDeletedAtIsNull(String owner);

  boolean existsBySkuAndDeletedAtIsNull(String sku);

  List<Product> findByDeletedAtIsNotNull();

  @Query("select p from Product p where p.owner = :owner and p.deletedAt is null order by p.sku")
  List<Product> inOrderOf(String owner);

  @Query("select p from Product p where p.sku = :sku and p.deletedAt is null")
  List<Product> visible(String sku);

  @Query(value = "select * from product where sku = :sku and deleted_at is null", nativeQuery = true)
  List<Product> visibleNative(String sku);

  List<Product> findByOwner(String owner);

  @Query("select p from Product p where p.sku like :pattern")
  List<Product> matching(String pattern);
}
