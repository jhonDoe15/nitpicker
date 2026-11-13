package shop;

import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

public final class Replies {
  private static final long DEADLINE_SECONDS = 5;

  private final Map<String, CompletableFuture<String>> pending = new ConcurrentHashMap<>();

  public interface Channel {
    void onReply(Consumer<String> listener);

    void onFailure(Consumer<Throwable> listener);
  }

  public CompletableFuture<String> listen(Channel channel) {
    CompletableFuture<String> reply = new CompletableFuture<>(); // violation: FutureWithoutException
    channel.onReply(value -> reply.complete(value));
    return reply;
  }

  public CompletableFuture<String> reference(Channel channel) {
    CompletableFuture<String> reply = new CompletableFuture<>(); // violation: FutureWithoutException
    channel.onReply(reply::complete);
    return reply;
  }

  public CompletableFuture<String> failing(Channel channel) {
    CompletableFuture<String> reply = new CompletableFuture<>();
    channel.onReply(reply::complete);
    channel.onFailure(reply::completeExceptionally);
    return reply;
  }

  public CompletableFuture<String> bounded(Channel channel) {
    CompletableFuture<String> reply = new CompletableFuture<>();
    channel.onReply(reply::complete);
    return reply.orTimeout(DEADLINE_SECONDS, TimeUnit.SECONDS);
  }

  public CompletableFuture<String> tracked(Channel channel, String key) {
    CompletableFuture<String> reply = new CompletableFuture<>();
    pending.put(key, reply);
    channel.onReply(reply::complete);
    return reply;
  }
}
