package shop.trash;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class ProductService {
  private final ProductRepository products;
  private final EntityManager entities;

  public ProductService(ProductRepository products, EntityManager entities) {
    this.products = products;
    this.entities = entities;
  }

  public List<Product> live(String sku) {
    return products.findBySkuAndDeletedAtIsNull(sku);
  }

  public List<Product> trashed() {
    return products.findByDeletedAtIsNotNull();
  }

  public List<Product> ownedBy(String owner) {
    return products.findByOwner(owner);
  }

  public List<Product> like(String pattern) {
    return products.matching(pattern);
  }

  public Product bySku(String sku) {
    return entities
        .createQuery("select p from Product p where p.sku = :sku", Product.class)
        .setParameter("sku", sku)
        .getSingleResult();
  }

  public List<Product> liveBy(String sku) {
    return entities
        .createQuery("select p from Product p where p.sku = :sku and p.deletedAt is null", Product.class)
        .setParameter("sku", sku)
        .getResultList();
  }
}
