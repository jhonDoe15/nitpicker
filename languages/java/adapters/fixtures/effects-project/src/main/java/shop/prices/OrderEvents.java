package shop.prices;

import org.springframework.kafka.core.KafkaTemplate;

public class OrderEvents {
  private final KafkaTemplate<String, String> kafka;

  public OrderEvents(KafkaTemplate<String, String> kafka) {
    this.kafka = kafka;
  }

  public void placed(Long id) {
    kafka.send("orders", String.valueOf(id));
  }
}
