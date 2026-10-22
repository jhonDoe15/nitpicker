package shop.billing;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import shop.orders.OrderService;
import shop.orders.internal.Audit;

@Service
public class BillingService {
  private final OrderService orders;

  public BillingService(OrderService orders) {
    this.orders = orders;
  }

  public String bill(Long id) {
    return Audit.stamp() + orders.find(id);
  }

  public ResponseEntity<String> reply() {
    return ResponseEntity.ok("billed");
  }
}
