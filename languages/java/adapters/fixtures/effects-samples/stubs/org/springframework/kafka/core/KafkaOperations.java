package org.springframework.kafka.core;

public interface KafkaOperations<K, V> {
  Object send(String topic, V value);
}
