package shop.catalog;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends JpaRepository<Product, Long> {
  Optional<Product> findById(Long id);

  Optional<Product> findByName(String name); // violation: SpringDataDerivedQuery

  List<Product> findBySupplierAndPriceGreaterThanOrderByNameDesc( // violation: SpringDataDerivedQuery
      Supplier supplier, long price);

  @Query(
      """
      select p from Product p
      join fetch p.supplier
      where p.name = :name
      """)
  Optional<Product> withSupplierByName(@Param("name") String name);

  @Query("select p from Product p where p.name = ?1") // violation: SpringDataNamedParameters
  List<Product> byNamePositional(String name);

  @Query("select p from Product p " + "where p.price > :price") // violation: SpringDataQueryTextBlock
  List<Product> pricierThan(@Param("price") long price);

  @Query(value = "select * from product where name = :name", nativeQuery = true) // violation: SpringDataNativeQuery
  List<Product> nativeByName(@Param("name") String name);

  @SuppressWarnings("PMD.SpringDataNativeQuery")
  @Query(value = "select * from product for update skip locked", nativeQuery = true)
  List<Product> lockBatch();

  @Modifying // violation: SpringDataModifyingQuery
  @Query("update Product p set p.price = :price")
  int reprice(@Param("price") long price);

  @Modifying(clearAutomatically = true, flushAutomatically = true)
  @Query("delete from Product p where p.price = 0")
  int deleteFree();

  default Optional<Product> named(String name) {
    return withSupplierByName(name);
  }
}
