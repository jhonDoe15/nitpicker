package shop.fetches;

import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Root;
import java.util.List;
import shop.catalog.Product;

public class ProductCriteria {
  private static final String BOTH = "select p from Product p join fetch p.reviews join fetch p.labels";

  private final EntityManager entityManager;

  public ProductCriteria(EntityManager entityManager) {
    this.entityManager = entityManager;
  }

  public List<Product> withReviewsAndTags() {
    CriteriaQuery<Product> query = entityManager.getCriteriaBuilder().createQuery(Product.class);
    Root<Product> product = query.from(Product.class);
    product.fetch("reviews");
    product.fetch("tags"); // violation: JpaMultipleCollectionFetch
    return entityManager.createQuery(query).getResultList();
  }

  public List<Product> withReviews() {
    CriteriaQuery<Product> query = entityManager.getCriteriaBuilder().createQuery(Product.class);
    query.from(Product.class).fetch("reviews");
    return entityManager.createQuery(query).getResultList();
  }

  public List<Product> withReviewsAndLabels() {
    return entityManager.createQuery(BOTH, Product.class).getResultList(); // violation: JpaMultipleCollectionFetch
  }

  public List<Product> withLabelsAndBadges() {
    return entityManager.createQuery("select p from Product p join fetch p.labels join fetch p.badges", Product.class) // violation: JpaMultipleCollectionFetch
        .getResultList();
  }
}
