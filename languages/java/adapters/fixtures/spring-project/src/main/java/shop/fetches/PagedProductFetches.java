package shop.fetches;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import shop.catalog.Product;

public interface PagedProductFetches extends JpaRepository<Product, Long> {
  @Query("select p from Product p join fetch p.reviews where p.id > :from") // violation: SpringPagedCollectionFetch
  Page<Product> pageWithReviews(@Param("from") long from, Pageable pageable);

  @Query("select p from Product p left join fetch p.supplier join fetch p.labels where p.id > :from") // violation: SpringPagedCollectionFetch
  Slice<Product> sliceWithSupplierAndLabels(@Param("from") long from, Pageable pageable);

  @Query("select p from Product p left join fetch p.supplier where p.id > :from")
  Page<Product> pageWithSupplier(@Param("from") long from, Pageable pageable);

  @Query("select p from Product p join p.reviews r where r.id > :from")
  Page<Product> pageJoiningReviews(@Param("from") long from, Pageable pageable);

  @EntityGraph(attributePaths = "tags") // violation: SpringPagedCollectionFetch
  @Query("select p from Product p where p.id > :from")
  Page<Product> pageWithTags(@Param("from") long from, Pageable pageable);

  @EntityGraph(attributePaths = "preferredSupplier")
  @Query("select p from Product p where p.id > :from")
  Page<Product> pageWithPreferredSupplier(@Param("from") long from, Pageable pageable);

  @Query("select p from Product p join fetch p.reviews where p.id > :from")
  java.util.List<Product> listWithReviews(@Param("from") long from);
}
