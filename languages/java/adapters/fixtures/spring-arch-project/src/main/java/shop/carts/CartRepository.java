package shop.carts;

import org.springframework.stereotype.Repository;

@Repository
public class CartRepository {
  private final CartService service;
  private final CheckoutUseCase checkout;

  public CartRepository(CartService service, CheckoutUseCase checkout) {
    this.service = service;
    this.checkout = checkout;
  }
}
