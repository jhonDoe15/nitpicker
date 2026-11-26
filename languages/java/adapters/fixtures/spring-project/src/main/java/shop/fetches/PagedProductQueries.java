package shop.fetches;

import jakarta.persistence.EntityManager;
import jakarta.persistence.TypedQuery;
import java.util.List;
import shop.catalog.Product;

public class PagedProductQueries {
  private final EntityManager entityManager;

  public PagedProductQueries(EntityManager entityManager) {
    this.entityManager = entityManager;
  }

  public List<Product> firstWithReviews(int size) {
    return entityManager // violation: SpringPagedCollectionFetch
        .createQuery("select p from Product p join fetch p.reviews", Product.class)
        .setMaxResults(size)
        .getResultList();
  }

  public List<Product> firstWithSupplier(int size) {
    return entityManager
        .createQuery("select p from Product p join fetch p.supplier", Product.class)
        .setMaxResults(size)
        .getResultList();
  }

  public List<Product> allWithReviews() {
    TypedQuery<Product> query =
        entityManager.createQuery("select p from Product p join fetch p.reviews", Product.class);
    return query.getResultList();
  }
}
