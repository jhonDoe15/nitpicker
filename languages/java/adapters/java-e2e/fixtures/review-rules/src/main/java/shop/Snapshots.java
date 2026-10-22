package shop;

import java.io.IOException;
import java.io.StringReader;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

public final class Snapshots {
  private Snapshots() {}

  static void detached(ExecutorService executor) throws IOException {
    try (StringReader in = new StringReader("a")) {
      executor.submit(() -> in.read()); // violation: TaskOutlivesTryResource
    }
  }

  static CompletableFuture<Integer> returned() {
    try (StringReader in = new StringReader("a")) {
      return CompletableFuture.supplyAsync(() -> in.hashCode()); // violation: TaskOutlivesTryResource
    }
  }

  static Future<Integer> kept(ExecutorService executor) {
    try (StringReader in = new StringReader("a")) {
      Future<Integer> pending = executor.submit(() -> in.read()); // violation: TaskOutlivesTryResource
      return pending;
    }
  }

  static void executorFirst() throws IOException {
    try (ExecutorService executor = Executors.newFixedThreadPool(1);
        StringReader in = new StringReader("a")) {
      executor.submit(() -> in.read()); // violation: TaskOutlivesTryResource
    }
  }

  static int joined(ExecutorService executor) throws Exception {
    try (StringReader in = new StringReader("a")) {
      return executor.submit(() -> in.read()).get();
    }
  }

  static int chained() {
    try (StringReader in = new StringReader("a")) {
      return CompletableFuture.supplyAsync(() -> in.hashCode()).join();
    }
  }

  static void waited(ExecutorService executor) throws Exception {
    try (StringReader in = new StringReader("a")) {
      Future<Integer> pending = executor.submit(() -> in.read());
      pending.get();
    }
  }

  static void drained(ExecutorService executor) throws Exception {
    try (StringReader in = new StringReader("a")) {
      executor.submit(() -> in.read());
      executor.shutdown();
      executor.awaitTermination(1, TimeUnit.SECONDS);
    }
  }

  static void executorLast() throws IOException {
    try (StringReader in = new StringReader("a");
        ExecutorService executor = Executors.newFixedThreadPool(1)) {
      executor.submit(() -> in.read());
    }
  }

  static void opened(ExecutorService executor) {
    executor.submit(
        () -> {
          try (StringReader in = new StringReader("a")) {
            return in.read();
          }
        });
  }
}
