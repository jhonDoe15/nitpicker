package shop.orders;

import org.springframework.data.repository.Repository;

public interface OrderRepository extends Repository<Order, Long> {
  Order findOne(Long id);
}
