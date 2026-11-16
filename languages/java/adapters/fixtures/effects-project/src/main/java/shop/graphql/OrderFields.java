package shop.graphql;

import com.netflix.graphql.dgs.DgsData;
import org.springframework.graphql.data.method.annotation.SchemaMapping;
import shop.orders.Order;
import shop.orders.OrderLoader;
import shop.orders.OrderRepository;
import shop.prices.PriceSource;

public class OrderFields {
  private final OrderRepository repository;
  private final OrderLoader loader;
  private final PriceSource prices;

  public OrderFields(OrderRepository repository, OrderLoader loader, PriceSource prices) {
    this.repository = repository;
    this.loader = loader;
    this.prices = prices;
  }

  @SchemaMapping(typeName = "Order", field = "previous")
  public Order previous(Order order) {
    return repository.findById(order.getId() - 1).orElse(null);
  }

  @SchemaMapping
  public Order viaHelper(Order order) {
    return loader.load(order.getId());
  }

  @SchemaMapping(typeName = "Order")
  public java.math.BigDecimal price(Order order) {
    return prices.priceOf(order.getId());
  }

  @DgsData(parentType = "Order", field = "previous")
  public Order dgsPrevious(Order order) {
    return repository.findById(order.getId() - 1).orElse(null);
  }
}
