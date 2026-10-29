package shop.carts;

import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CartService {
  @Autowired private Optional<Basket> fieldBasket;

  public CartService(
      Basket basket,
      Cart cart,
      ObjectProvider<Basket> baskets,
      SessionBasket sessionBasket,
      Tenant tenant,
      Draft draft,
      List<Visit> visits) {}
}
