package shop;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.stream.IntStream;

public final class Prefetch {
  private static final List<String> MIRRORS = List.of("https://a.example", "https://b.example");
  private final HttpClient client;
  private final ExecutorService workers = Executors.newFixedThreadPool(8);
  private final ExecutorService everyone = Executors.newCachedThreadPool();
  private final ExecutorService virtual = Executors.newVirtualThreadPerTaskExecutor();
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

  public void virtualSubmit(List<String> urls) {
    for (String url : urls) { // violation: UnboundedFanOut
      virtual.submit(() -> body(url));
    }
  }

  public void executeEach(List<String> urls) {
    urls.forEach(url -> everyone.execute(() -> body(url))); // violation: UnboundedFanOut
  }

  public void startVirtual(List<String> urls) {
    for (String url : urls) { // violation: UnboundedFanOut
      Thread.startVirtualThread(() -> body(url));
    }
  }

  public List<CompletableFuture<String>> indexed(List<String> urls) {
    List<CompletableFuture<String>> pending = new ArrayList<>();
    for (int i = 0; i < urls.size(); i++) { // violation: UnboundedFanOut
      String url = urls.get(i);
      pending.add(CompletableFuture.supplyAsync(() -> body(url)));
    }
    return pending;
  }

  public void referenced(List<String> urls) {
    urls.forEach(this::startOne); // violation: UnboundedFanOut
  }

  public void deep(List<String> urls) {
    urls.forEach(url -> launch(url)); // violation: UnboundedFanOut
  }

  public void threads(List<String> urls) {
    for (String url : urls) { // violation: UnboundedFanOut
      new Thread(() -> body(url)).start();
    }
  }

  public void builders(List<String> urls) {
    for (String url : urls) { // violation: UnboundedFanOut
      Thread.ofVirtual().start(() -> body(url));
    }
  }

  public List<Future<String>> invoked(List<String> urls) throws InterruptedException {
    List<Callable<String>> tasks = urls.stream().map(url -> (Callable<String>) () -> body(url)).toList();
    return everyone.invokeAll(tasks); // violation: UnboundedFanOut
  }

  public List<Future<String>> invokedPooled(List<String> urls) throws InterruptedException {
    List<Callable<String>> tasks = urls.stream().map(url -> (Callable<String>) () -> body(url)).toList();
    return workers.invokeAll(tasks);
  }

  public List<CompletableFuture<String>> wholeList(List<String> urls) {
    return urls.subList(0, urls.size()).stream().map(url -> CompletableFuture.supplyAsync(() -> body(url))).toList(); // violation: UnboundedFanOut
  }

  public List<CompletableFuture<String>> ranged(List<String> urls) {
    return IntStream.range(0, urls.size()).mapToObj(i -> CompletableFuture.supplyAsync(() -> body(urls.get(i)))).toList(); // violation: UnboundedFanOut
  }

  public List<CompletableFuture<String>> rangedCount(List<String> urls) {
    int count = urls.size();
    return IntStream.range(0, count).mapToObj(i -> CompletableFuture.supplyAsync(() -> body(urls.get(i)))).toList(); // violation: UnboundedFanOut
  }

  public void fromGetter() {
    getUrls().stream().forEach(url -> CompletableFuture.supplyAsync(() -> body(url))); // violation: UnboundedFanOut
  }

  public void fromArray(String[] urls) {
    Arrays.stream(urls).forEach(url -> CompletableFuture.supplyAsync(() -> body(url))); // violation: UnboundedFanOut
  }

  public void forGetter() {
    for (String url : getUrls()) { // violation: UnboundedFanOut
      CompletableFuture.supplyAsync(() -> body(url));
    }
  }

  public void literalArray() {
    for (String url : new String[] {"https://a.example", "https://b.example"}) {
      CompletableFuture.supplyAsync(() -> body(url));
    }
  }

  public List<CompletableFuture<String>> pool(int workerCount) {
    return IntStream.range(0, workerCount).mapToObj(i -> CompletableFuture.supplyAsync(() -> body("https://a.example"))).toList();
  }

  public void batches(List<String> urls) throws InterruptedException, ExecutionException {
    for (int start = 0; start < urls.size(); start += 20) {
      List<String> batch = urls.subList(start, Math.min(start + 20, urls.size()));
      List<CompletableFuture<String>> pending = batch.stream().map(url -> CompletableFuture.supplyAsync(() -> body(url))).toList();
      CompletableFuture.allOf(pending.toArray(new CompletableFuture[0])).get();
    }
  }

  public void counted(int workerCount) {
    for (int i = 0; i < workerCount; i++) {
      CompletableFuture.supplyAsync(() -> body("https://a.example"));
    }
  }

  public void joinedThreads(List<String> urls) throws InterruptedException {
    for (String url : urls) {
      Thread thread = new Thread(() -> body(url));
      thread.start();
      thread.join();
    }
  }

  private List<String> getUrls() {
    return List.of();
  }

  private void startOne(String url) {
    CompletableFuture.supplyAsync(() -> body(url));
  }

  private void launch(String url) {
    schedule(url);
  }

  private void schedule(String url) {
    CompletableFuture.supplyAsync(() -> body(url));
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
