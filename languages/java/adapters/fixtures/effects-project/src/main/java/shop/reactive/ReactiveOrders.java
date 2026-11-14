package shop.reactive;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import shop.orders.Order;

public interface ReactiveOrders extends ReactiveCrudRepository<Order, Long> {}
