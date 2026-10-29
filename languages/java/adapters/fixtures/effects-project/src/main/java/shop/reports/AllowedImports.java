package shop.reports;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import org.springframework.data.domain.Page;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.client.RestClient;
import shop.orders.Order;
import shop.orders.OrderLoader;
import shop.prices.OrderEvents;
import shop.prices.PriceSource;

public class AllowedImports {
  private final OrderLoader loader;
  private final PriceSource prices;
  private final OrderEvents events;
  private final KafkaTemplate<String, String> kafkaTemplate;
  private final RestClient client;

  public AllowedImports(
      OrderLoader loader,
      PriceSource prices,
      OrderEvents events,
      KafkaTemplate<String, String> kafkaTemplate,
      RestClient client) {
    this.loader = loader;
    this.prices = prices;
    this.events = events;
    this.kafkaTemplate = kafkaTemplate;
    this.client = client;
  }

  public List<Order> batched(List<Long> ids) {
    return loader.loadAll(ids);
  }

  public long paged() {
    long total = 0;
    int number = 0;
    Page<Order> page;
    do {
      page = loader.page(number++);
      total += page.getNumberOfElements();
    } while (page.hasNext());
    return total;
  }

  public BigDecimal retried(Long id) {
    RuntimeException last = null;
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return prices.priceOf(id);
      } catch (RuntimeException failed) {
        last = failed;
      }
    }
    throw last;
  }

  public void chunked(List<List<Long>> chunks) {
    for (List<Long> chunk : chunks) {
      loader.forget(chunk);
    }
  }

  public List<String> files(List<Path> paths) throws IOException {
    List<String> texts = new ArrayList<>();
    for (Path path : paths) {
      texts.add(loader.readFile(path));
    }
    return texts;
  }

  public Optional<Order> once(Long id) {
    return Optional.of(id).map(loader::load);
  }

  public void published(List<Long> ids) {
    for (Long id : ids) {
      events.placed(id);
    }
  }

  public List<BigDecimal> remoteInParallel(List<Long> ids) {
    return ids.parallelStream().map(prices::priceOf).toList();
  }

  public void sentDirectly(List<Long> ids) {
    for (Long id : ids) {
      kafkaTemplate.send("orders", String.valueOf(id));
    }
  }

  public List<String> fetchedInParallel(List<Long> ids) {
    return ids.parallelStream().map(id -> client.get().uri("/orders/{id}", id).retrieve().body(String.class)).toList();
  }

  public List<String> fetchedTogether(List<Long> ids) {
    List<CompletableFuture<String>> futures = new ArrayList<>();
    for (Long id : ids) {
      futures.add(CompletableFuture.supplyAsync(
          () -> client.get().uri("/orders/{id}", id).retrieve().body(String.class)));
    }
    return futures.stream().map(CompletableFuture::join).toList();
  }

  public void sentLater(List<Long> ids) {
    for (Long id : ids) {
      CompletableFuture.runAsync(() -> client.post().uri("/orders/{id}", id).retrieve().toBodilessEntity());
    }
  }
}
