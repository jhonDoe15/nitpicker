package shop.smells;

public interface CacheManager {
  void evict(String key);
}
