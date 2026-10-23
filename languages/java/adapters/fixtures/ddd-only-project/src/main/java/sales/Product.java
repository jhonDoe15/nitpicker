package sales;

import org.jmolecules.ddd.types.AggregateRoot;
import org.jmolecules.ddd.types.Identifier;

public class Product implements AggregateRoot<Product, Product.ProductId> {
  private ProductId id;
  private Product parent;

  @Override
  public ProductId getId() {
    return id;
  }

  public record ProductId(long value) implements Identifier {}
}
