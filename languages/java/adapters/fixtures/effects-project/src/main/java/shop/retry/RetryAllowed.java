package shop.retry;

import com.stripe.exception.StripeException;
import com.stripe.model.Charge;
import com.stripe.net.RequestOptions;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.retry.annotation.Retryable;
import shop.orders.Order;
import shop.orders.OrderRepository;

public class RetryAllowed {
  private final OrderRepository repository;
  private final JdbcTemplate jdbc;

  public RetryAllowed(OrderRepository repository, JdbcTemplate jdbc) {
    this.repository = repository;
    this.jdbc = jdbc;
  }

  @Retryable
  public Order load(Long id) {
    return repository.findById(id).orElseThrow();
  }

  public void upsert(Long id) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        jdbc.update("INSERT INTO orders (id) VALUES (?) ON CONFLICT (id) DO NOTHING", id);
        return;
      } catch (DataAccessException retry) {
        continue;
      }
    }
  }

  @Retryable
  public Charge charge(Long orderId, Map<String, Object> params) throws StripeException {
    return Charge.create(params, RequestOptions.builder().setIdempotencyKey("order-" + orderId).build());
  }
}
