package shop.async;

import jakarta.ws.rs.container.AsyncResponse;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import org.springframework.web.context.request.async.DeferredResult;

public final class PendingResults {
  private final CompletableFuture<String> published = new CompletableFuture<>();

  CompletableFuture<Boolean> migrated(String topic) {
    return CompletableFuture.completedFuture(topic.isEmpty());
  }

  CompletableFuture<String> read(String topic) {
    return CompletableFuture.completedFuture(topic);
  }

  CompletableFuture<Void> checkMigration(String topic) {
    CompletableFuture<Void> result = new CompletableFuture<>();
    migrated(topic) // violation: CompletionWithoutFailurePath
        .handle(
            (isMigrated, ex) -> {
              if (isMigrated) {
                result.completeExceptionally(new IllegalStateException(topic));
              } else {
                result.complete(null);
              }
              return null;
            });
    return result;
  }

  CompletableFuture<Void> splitBundle(String topic) {
    CompletableFuture<Void> updated = new CompletableFuture<>();
    read(topic) // violation: CompletionWithoutFailurePath
        .thenAccept(
            name -> {
              if (name.isEmpty()) {
                updated.completeExceptionally(new IllegalArgumentException(topic));
                return;
              }
              updated.complete(null);
            });
    return updated;
  }

  void publish(String topic) {
    read(topic).thenAccept(name -> published.complete(name)); // violation: CompletionWithoutFailurePath
  }

  void resumeWhenFound(String topic, AsyncResponse response) {
    read(topic).thenAccept(name -> response.resume(name)); // violation: CompletionWithoutFailurePath
  }

  void respondLater(String topic, DeferredResult<String> response) {
    read(topic).thenAccept(name -> response.setResult(name)); // violation: CompletionWithoutFailurePath
  }

  void completeWhenDone(String topic, CompletableFuture<String> target) {
    read(topic) // violation: CompletionWithoutFailurePath
        .whenComplete(
            (value, ex) -> target.complete(value));
  }

  CompletionStage<Void> returnsTheStage(String topic) {
    return read(topic).thenCompose(name -> CompletableFuture.completedFuture(null));
  }

  CompletableFuture<Void> forwardsTheFailure(String topic) {
    CompletableFuture<Void> result = new CompletableFuture<>();
    read(topic)
        .thenAccept(name -> result.complete(null))
        .exceptionally(
            ex -> {
              result.completeExceptionally(ex);
              return null;
            });
    return result;
  }

  CompletableFuture<Void> forwardsInAnotherStatement(String topic) {
    CompletableFuture<Void> result = new CompletableFuture<>();
    CompletableFuture<String> source = read(topic);
    source.thenAccept(name -> result.complete(null));
    source.whenComplete(
        (value, ex) -> {
          if (ex != null) {
            result.completeExceptionally(ex);
          }
        });
    return result;
  }

  void completesOnAnySignal(String topic, CompletableFuture<String> target) {
    read(topic).whenComplete((value, ex) -> target.complete(topic));
  }

  CompletableFuture<Void> readsTheThrowable(String topic) {
    CompletableFuture<Void> result = new CompletableFuture<>();
    read(topic)
        .whenComplete(
            (value, ex) -> {
              if (ex != null) {
                result.completeExceptionally(ex);
              } else {
                result.complete(null);
              }
            });
    return result;
  }

  void resumesWithTheFailure(String topic, AsyncResponse response) {
    read(topic)
        .handle(
            (name, ex) -> {
              if (ex != null) {
                return response.resume(ex);
              }
              return response.resume(name);
            });
  }

  CompletableFuture<String> storesTheStage(String topic, CompletableFuture<String> target) {
    CompletableFuture<Void> stage = read(topic).thenAccept(name -> target.complete(name));
    return stage.thenCompose(done -> target);
  }

  void doesNotCompleteAResult(String topic) {
    read(topic).thenAccept(name -> name.length());
  }
}
