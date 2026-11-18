package shop.carts;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import java.util.List;

@Entity
public class Basket {
  @Id private Long id;

  @OneToMany(mappedBy = "basket")
  private List<Item> items;

  public Long getId() {
    return id;
  }

  public List<Item> getItems() {
    return items;
  }
}
