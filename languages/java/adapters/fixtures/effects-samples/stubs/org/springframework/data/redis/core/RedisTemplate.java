package org.springframework.data.redis.core;

public class RedisTemplate<K, V> {
  public ValueOperations<K, V> opsForValue() {
    return null;
  }
}
