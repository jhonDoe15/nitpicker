package shop;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;

public final class Prefetch {
  private static final List<String> MIRRORS = List.of("https://a.example", "https://b.example");
  private final HttpClient client;
  private final ExecutorService workers = Executors.newFixedThreadPool(8);
  private final ExecutorService everyone = Executors.newCachedThreadPool();
  private final Semaphore permits = new Semaphore(8);

  public Prefetch(HttpClient client) {
    this.client = client;
  }

  public List<CompletableFuture<String>> pages(List<String> urls) {
    return urls.stream().map(url -> CompletableFuture.supplyAsync(() -> body(url))).toList(); // violation: UnboundedFanOut
  }

  public List<Future<String>> queued(List<String> urls) {
    List<Future<String>> pending = new ArrayList<>();
    for (String url : urls) { // violation: UnboundedFanOut
      pending.add(everyone.submit(() -> body(url)));
    }
    return pending;
  }

  public List<CompletableFuture<HttpResponse<String>>> sent(List<String> urls) {
    return urls.stream().map(url -> client.sendAsync(request(url), HttpResponse.BodyHandlers.ofString())).toList(); // violation: UnboundedFanOut
  }

  public List<CompletableFuture<String>> pooled(List<String> urls) {
    return urls.stream().map(url -> CompletableFuture.supplyAsync(() -> body(url), workers)).toList();
  }

  public List<CompletableFuture<String>> permitted(List<String> urls) {
    return urls.stream().map(url -> CompletableFuture.supplyAsync(() -> limited(url))).toList();
  }

  public List<CompletableFuture<String>> mirrors() {
    return MIRRORS.stream().map(url -> CompletableFuture.supplyAsync(() -> body(url))).toList();
  }

  public List<String> oneByOne(List<String> urls) {
    return urls.stream().map(url -> CompletableFuture.supplyAsync(() -> body(url)).join()).toList();
  }

  private String limited(String url) {
    permits.acquireUninterruptibly();
    try {
      return body(url);
    } finally {
      permits.release();
    }
  }

  private HttpRequest request(String url) {
    return HttpRequest.newBuilder(URI.create(url)).build();
  }

  private String body(String url) {
    try {
      return client.send(request(url), HttpResponse.BodyHandlers.ofString()).body();
    } catch (IOException error) {
      throw new UncheckedIOException(error);
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(error);
    }
  }
}
