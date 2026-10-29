package shop;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.ManyToOne;
import java.util.List;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.data.repository.CrudRepository;
import org.springframework.web.client.RestClient;

@Entity
class Customer {
  @Id Long id;
  String name;

  Long getId() {
    return id;
  }

  String getName() {
    return name;
  }
}

@Entity
class Order {
  @Id Long id;
  String status;

  @ManyToOne(fetch = FetchType.LAZY)
  Customer customer;

  Long getId() {
    return id;
  }

  Customer getCustomer() {
    return customer;
  }

  void setStatus(String status) {
    this.status = status;
  }
}

interface OrderRepository extends CrudRepository<Order, Long> {
  Order getFirstByStatus(String status);

  Order getOrderByStatus(String status);

  List<Order> findByIdIn(List<Long> ids);
}

@FeignClient(name = "prices")
interface PriceClient {
  String priceOf(Long id);
}

class Gateway {
  RestClient rest;

  String fetch(long id) {
    return rest.get().uri("/x/{id}", id).body();
  }
}
