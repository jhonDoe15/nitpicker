package shop.retry;

import com.stripe.exception.StripeException;
import com.stripe.model.Charge;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.retry.annotation.Retryable;
import org.springframework.retry.support.RetryTemplate;
import shop.prices.OrderEvents;

public class Retries {
  private final OrderEvents events;
  private final JdbcTemplate jdbc;
  private final RetryTemplate retries;

  public Retries(OrderEvents events, JdbcTemplate jdbc, RetryTemplate retries) {
    this.events = events;
    this.jdbc = jdbc;
    this.retries = retries;
  }

  @Retryable
  public void announce(Long id) {
    events.placed(id);
  }

  public void record(Long id) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        jdbc.update("INSERT INTO orders (id) VALUES (?)", id);
        return;
      } catch (DataAccessException retry) {
        continue;
      }
    }
  }

  public Charge charge(Map<String, Object> params) {
    return retries.execute(context -> {
      try {
        return Charge.create(params);
      } catch (StripeException failed) {
        throw new IllegalStateException(failed);
      }
    });
  }
}
