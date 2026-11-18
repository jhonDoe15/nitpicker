package shop.graphql;

import com.netflix.graphql.dgs.DgsData;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.graphql.data.method.annotation.BatchMapping;
import org.springframework.graphql.data.method.annotation.SchemaMapping;
import shop.orders.Order;
import shop.orders.OrderRepository;

public class OrderFieldsAllowed {
  private final OrderRepository repository;

  public OrderFieldsAllowed(OrderRepository repository) {
    this.repository = repository;
  }

  @BatchMapping(typeName = "Order", field = "previous")
  public Map<Order, Order> previous(List<Order> orders) {
    Map<Long, Order> byId = repository.findAllById(orders.stream().map(Order::getId).toList()).stream()
        .collect(Collectors.toMap(Order::getId, order -> order));
    return orders.stream().collect(Collectors.toMap(order -> order, order -> byId.get(order.getId() - 1)));
  }

  @SchemaMapping(typeName = "Query", field = "orders")
  public List<Order> orders() {
    return repository.findAll();
  }

  @DgsData(parentType = "Query", field = "orders")
  public List<Order> dgsOrders() {
    return repository.findAll();
  }

  @SchemaMapping(typeName = "Order")
  public String status(Order order) {
    return order.getTotal().toString();
  }

  @SchemaMapping(typeName = "Account")
  public Order lastOrder(Account account) {
    return repository.findById(account.id()).orElse(null);
  }
}
