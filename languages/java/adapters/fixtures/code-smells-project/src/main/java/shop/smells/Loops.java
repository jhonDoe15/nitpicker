package shop.smells;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

public final class Loops {
  private final OrderRepository orders;

  public Loops(OrderRepository orders) {
    this.orders = orders;
  }

  public List<String> lookups(List<String> ids) {
    List<String> found = new ArrayList<>();
    for (String id : ids) {
      found.add(orders.findById(id)); // violation: IoCallInLoop
    }
    return found;
  }

  public int sizes(List<Path> paths) throws IOException {
    int total = 0;
    for (Path path : paths) {
      if (Files.exists(path)) {
        total += Files.readString(path).length();
      }
    }
    return total;
  }

  public int pages() {
    int page = 0;
    List<String> batch;
    do {
      batch = orders.findPage(page);
      page++;
    } while (!batch.isEmpty());
    return page;
  }

  public String retried(String id) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return orders.findById(id);
      } catch (IllegalStateException e) {
        Thread.onSpinWait();
      }
    }
    throw new IllegalStateException("unavailable");
  }

  public List<String> indexed(List<String> ids) {
    List<String> found = new ArrayList<>();
    int index = 0;
    while (index < ids.size()) {
      found.add(orders.findById(ids.get(index))); // violation: IoCallInLoop
      index += 1;
    }
    int next = 0;
    while (next < ids.size()) {
      found.add(orders.findById(ids.get(next))); // violation: IoCallInLoop
      next = next + 1;
    }
    return found;
  }

  public void saves(List<String> ids) {
    for (String id : ids) {
      orders.save(id); // violation: IoCallInLoop
    }
    ids.forEach(orders::delete); // violation: IoCallInLoop
  }

  public void chunked(List<List<String>> chunks) {
    for (List<String> chunk : chunks) {
      orders.saveAll(chunk);
    }
  }

  public String loaded(String id) {
    return Optional.of(id).map(orders::findById).orElse("");
  }

  public int lengths(List<String> ids) {
    int total = 0;
    for (String id : ids) {
      total += id.length();
    }
    return total;
  }
}
