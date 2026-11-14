package shop;

import com.netflix.graphql.dgs.DgsData;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.dataloader.DataLoader;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.BatchMapping;
import org.springframework.graphql.data.method.annotation.ContextValue;
import org.springframework.graphql.data.method.annotation.SchemaMapping;
import org.springframework.security.core.Authentication;

class Account {
  Long id;
}

class Graphql {
  OrderRepository orders;
  PriceClient prices;

  @SchemaMapping(typeName = "Order", field = "customer")
  public Order direct(Order order) {
    return orders.findById(order.getId()).orElse(null);
  }

  @SchemaMapping
  public Order throughHelper(Order order) {
    return load(order.getId());
  }

  @SchemaMapping(typeName = "Order")
  public String price(Order order) {
    return prices.priceOf(order.getId());
  }

  @DgsData(parentType = "Order", field = "customer")
  public Order federated(Order order) {
    return orders.findById(order.getId()).orElse(null);
  }

  @BatchMapping
  public Map<Order, Order> batched(List<Order> parents) {
    return Map.of();
  }

  @SchemaMapping(typeName = "Query", field = "pending")
  public List<Order> root() {
    return orders.findAll();
  }

  @DgsData(parentType = "Query")
  public List<Order> dgsRoot() {
    return orders.findAll();
  }

  @SchemaMapping(typeName = "Order")
  public CompletableFuture<Order> loaded(Order order, DataLoader<Long, Order> loader) {
    return loader.load(order.getId());
  }

  @SchemaMapping(typeName = "Order")
  public String status(Order order) {
    return order.status;
  }

  @SchemaMapping(typeName = "Customer")
  public Order nested(Customer customer) {
    return orders.findById(customer.id).orElse(null);
  }

  @SchemaMapping(typeName = "Account")
  public Order single(Account account) {
    return orders.findById(account.id).orElse(null);
  }

  @SchemaMapping(field = "customer")
  public Order withContext(@ContextValue String tenant, @Argument Long id, Authentication user, Order order) {
    return orders.findById(order.getId()).orElse(null);
  }

  @SchemaMapping(field = "owner")
  public Order contextOnly(@ContextValue Account tenant, Authentication user) {
    return orders.findById(1L).orElse(null);
  }

  Order load(Long id) {
    return orders.findById(id).orElse(null);
  }
}
