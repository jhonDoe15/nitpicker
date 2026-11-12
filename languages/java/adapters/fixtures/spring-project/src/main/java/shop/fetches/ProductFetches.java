package shop.fetches;

import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import shop.catalog.Product;

public interface ProductFetches extends JpaRepository<Product, Long> {
  @Query("select p from Product p join fetch p.reviews join fetch p.tags") // violation: JpaMultipleCollectionFetch
  List<Product> withReviewsAndTags();

  @Query("select p from Product p join fetch p.reviews join p.tags t where t.id > 0")
  List<Product> withReviewsFilteredByTag();

  @EntityGraph(attributePaths = {"reviews", "labels"}) // violation: JpaMultipleCollectionFetch
  @Query("select p from Product p")
  List<Product> graphOfReviewsAndLabels();

  @EntityGraph(attributePaths = "reviews")
  @Query("select p from Product p")
  List<Product> graphOfReviews();
}
