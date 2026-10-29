package shop;

import com.stripe.model.PaymentIntent;
import com.stripe.net.RequestOptions;
import dev.failsafe.CircuitBreaker;
import dev.failsafe.Failsafe;
import dev.failsafe.RetryPolicy;
import java.util.Map;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.retry.annotation.Retryable;

class Writes {
  OrderRepository repo;
  KafkaTemplate<String, String> kafka;
  RequestOptions keyed = RequestOptions.builder().setIdempotencyKey("order").build();

  @Retryable
  public PaymentIntent keyFromHelper(Map<String, Object> params, String key) {
    return PaymentIntent.create(params, options(key));
  }

  @Retryable
  public PaymentIntent keyFromField(Map<String, Object> params) {
    return PaymentIntent.create(params, keyed);
  }

  @Retryable
  public PaymentIntent keyThroughWrapper(Map<String, Object> params, String key) {
    return charge(params, RequestOptions.builder().setIdempotencyKey(key).build());
  }

  @Retryable
  public PaymentIntent withoutKey(Map<String, Object> params) {
    return PaymentIntent.create(params);
  }

  PaymentIntent charge(Map<String, Object> params, RequestOptions options) {
    return PaymentIntent.create(params, options);
  }

  RequestOptions options(String key) {
    return RequestOptions.builder().setIdempotencyKey(key).build();
  }

  void breakerOnly() {
    Failsafe.with(CircuitBreaker.ofDefaults()).run(() -> kafka.send("orders", "placed"));
  }

  void withRetries() {
    Failsafe.with(RetryPolicy.ofDefaults()).run(() -> kafka.send("orders", "placed"));
  }

  void relayEach() {
    repo.findAll().forEach(order -> {
      kafka.send("orders", "placed " + order.getId());
      repo.delete(order);
    });
  }

  void relayOne() {
    Order order = repo.findAll().get(0);
    kafka.send("orders", "placed " + order.getId());
    repo.delete(order);
  }

  void relayThroughHelper() {
    Order order = repo.findAll().get(0);
    announce(order);
    repo.delete(order);
  }

  void announce(Order order) {
    kafka.send("orders", "placed " + order.getId());
  }

  void batchJob() {
    for (Order order : repo.findAll()) {
      order.setStatus("billed");
      repo.save(order);
      kafka.send("orders", "billed " + order.getId());
    }
  }
}
