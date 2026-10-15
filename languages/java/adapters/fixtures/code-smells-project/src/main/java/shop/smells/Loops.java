package shop.smells;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

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
        total += Files.readString(path).length(); // violation: IoCallInLoop
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

  public int lengths(List<String> ids) {
    int total = 0;
    for (String id : ids) {
      total += id.length();
    }
    return total;
  }
}
