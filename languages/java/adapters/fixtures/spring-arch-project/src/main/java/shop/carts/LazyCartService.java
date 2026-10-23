package shop.carts;

import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

@Service
public class LazyCartService {
  public LazyCartService(@Lazy Basket basket) {}
}
