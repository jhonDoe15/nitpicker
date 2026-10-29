package org.springframework.data.redis.core;

import java.util.Collection;
import java.util.List;

public interface ValueOperations<K, V> {
  V get(Object key);

  List<V> multiGet(Collection<K> keys);
}
