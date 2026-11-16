package org.dataloader;

import java.util.concurrent.CompletableFuture;

public interface DataLoader<K, V> {
  CompletableFuture<V> load(K key);
}
