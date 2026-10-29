package shop;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.stream.Collectors;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;

class Loops {
  OrderRepository repo;
  PriceClient prices;
  KafkaTemplate<String, String> kafka;
  RedisTemplate<String, String> redis;

  void stopsAtMissing(List<Long> ids) {
    for (long id : ids) {
      if (repo.findById(id).isEmpty()) {
        break;
      }
    }
  }

  void returnsAtMissing(List<Long> ids) {
    for (long id : ids) {
      if (repo.findById(id).isEmpty()) {
        return;
      }
    }
  }

  int whileByIndex(List<Long> ids) {
    int i = 0;
    while (i < ids.size() && repo.findById(ids.get(i)).isPresent()) {
      i++;
    }
    return i;
  }

  void untilEmptyIterator(Iterator<Long> ids) {
    while (ids.hasNext() && repo.findById(ids.next()).isPresent()) {
      ids.remove();
    }
  }

  int pages() {
    int offset = 0;
    List<Order> page;
    while (!(page = repo.findAll()).isEmpty()) {
      offset += page.size();
    }
    return offset;
  }

  void chunks(List<Long> ids, Map<String, List<Long>> groups, List<List<Long>> parts) {
    for (int i = 0; i < ids.size(); i += 100) {
      repo.findByIdIn(ids.subList(i, Math.min(i + 100, ids.size())));
    }
    for (int i = 0; i < ids.size(); i += 100) {
      repo.findByIdIn(List.copyOf(ids.subList(i, Math.min(i + 100, ids.size()))));
    }
    for (Map.Entry<String, List<Long>> group : groups.entrySet()) {
      repo.findByIdIn(group.getValue());
    }
    parts.forEach(repo::findByIdIn);
  }

  Map<Long, Order> collected(List<Long> ids) {
    return ids.stream().collect(Collectors.toMap(id -> id, id -> repo.findById(id).orElseThrow()));
  }

  List<Long> sorted(List<Long> ids) {
    List<Long> copy = new ArrayList<>(ids);
    copy.sort(Comparator.comparing(id -> prices.priceOf(id)));
    return copy;
  }

  String[] filled(Long[] ids) {
    String[] out = new String[ids.length];
    Arrays.setAll(out, i -> prices.priceOf(ids[i]));
    return out;
  }

  void derived(List<String> statuses) {
    for (String status : statuses) {
      repo.getFirstByStatus(status);
      repo.getOrderByStatus(status);
    }
  }

  void cached(List<String> keys) {
    for (String key : keys) {
      redis.opsForValue().get(key);
    }
  }

  void chained(List<Long> ids) {
    for (long id : ids) {
      repo
          .findById(id)
          .ifPresent(order -> order.setStatus("seen"));
    }
  }

  void concurrent(List<Long> ids) {
    ids.parallelStream().forEach(id -> prices.priceOf(id));
    ids.forEach(id -> CompletableFuture.supplyAsync(() -> kafka.send("orders", String.valueOf(id))).join());
    for (long id : ids) {
      kafka.send("orders", String.valueOf(id));
    }
  }
}
