package org.springframework.kafka.core;

public class KafkaTemplate<K, V> implements KafkaOperations<K, V> {
  @Override
  public Object send(String topic, V value) {
    return null;
  }
}
