package sales;

import org.jmolecules.ddd.types.AggregateRoot;
import org.jmolecules.ddd.types.Identifier;

public class Wishlist extends Holder<Product> implements AggregateRoot<Wishlist, Wishlist.WishlistId> {
  private WishlistId id;
  private Class<Customer> kind;

  @Override
  public WishlistId getId() {
    return id;
  }

  public record WishlistId(long value) implements Identifier {}
}
