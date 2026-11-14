package shop.lifecycles;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

public final class Replies implements AutoCloseable {
  private final Map<String, CompletableFuture<String>> pending = new ConcurrentHashMap<>(); // violation: PendingFuturesNotFailedOnClose
  private final Map<String, CompletableFuture<String>> failed = new ConcurrentHashMap<>();
  private final Map<String, CompletableFuture<String>> helped = new ConcurrentHashMap<>();
  private final List<CompletableFuture<String>> queued = new ArrayList<>();
  private final Map<String, String> names = new ConcurrentHashMap<>();

  public CompletableFuture<String> send(String id) {
    CompletableFuture<String> reply = new CompletableFuture<>();
    pending.put(id, reply);
    failed.put(id, reply);
    helped.put(id, reply);
    queued.add(reply);
    names.put(id, id);
    return reply;
  }

  @Override
  public void close() {
    pending.clear();
    failed.values().forEach(reply -> reply.completeExceptionally(new IllegalStateException("closed")));
    failed.clear();
    settleAll(helped);
    List<CompletableFuture<String>> copy = new ArrayList<>(queued);
    queued.clear();
    copy.forEach(reply -> reply.cancel(true));
    names.clear();
  }

  private static void settleAll(Map<String, CompletableFuture<String>> replies) {
    replies.values().forEach(reply -> reply.completeExceptionally(new IllegalStateException("closed")));
    replies.clear();
  }
}
