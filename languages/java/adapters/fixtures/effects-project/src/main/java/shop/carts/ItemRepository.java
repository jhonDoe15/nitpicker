package shop.carts;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ItemRepository extends JpaRepository<Item, Long> {
  List<Item> findByBasketIdAndDeletedAtIsNull(Long basket);

  List<Item> findByBasketIdIncludingDeleted(Long basket);
}
