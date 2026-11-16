package shop.jobs;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import shop.orders.OrderLoader;
import shop.prices.OrderEvents;

@Component
public class JobsAllowed {
  private final OrderLoader loader;
  private final OrderEvents events;
  private final SafeLoader safe;
  private final List<String> failures = new ArrayList<>();

  public JobsAllowed(OrderLoader loader, OrderEvents events, SafeLoader safe) {
    this.loader = loader;
    this.events = events;
    this.safe = safe;
  }

  @Scheduled(cron = "0 0 3 * * *")
  public void isolated(List<Long> ids) {
    for (Long id : ids) {
      try {
        loader.load(id);
      } catch (RuntimeException failed) {
        failures.add(id + ": " + failed.getMessage());
      }
    }
  }

  @Scheduled(fixedRate = 5_000)
  public void isolatedInCallback(List<Long> ids) {
    ids.forEach(
        id -> {
          try {
            loader.load(id);
          } catch (RuntimeException failed) {
            failures.add(id + ": " + failed.getMessage());
          }
        });
  }

  @Scheduled(fixedRate = 5_000)
  public void enqueueOnly(List<Long> ids) {
    for (Long id : ids) {
      events.placed(id);
    }
  }

  @Scheduled(fixedRate = 5_000)
  public void oneTaskPerItem(List<Long> ids) {
    List<CompletableFuture<Void>> tasks = new ArrayList<>();
    for (Long id : ids) {
      tasks.add(CompletableFuture.runAsync(() -> loader.load(id)));
    }
    tasks.forEach(CompletableFuture::join);
  }

  @Scheduled(fixedRate = 5_000)
  public void isolatedByHelper(List<Long> ids) {
    for (Long id : ids) {
      safe.load(id);
    }
  }

  @Scheduled(fixedRate = 5_000)
  public int countOnly(List<Long> ids) {
    int total = 0;
    for (Long id : ids) {
      total += id.intValue();
    }
    return total;
  }

  @KafkaListener(topics = "orders")
  public void onOrder(Long id) {
    loader.load(id);
  }

  public void notAJob(List<Long> ids) {
    for (Long id : ids) {
      loader.load(id);
    }
  }
}
