package shop.lifecycles;

import java.util.concurrent.CompletableFuture;

public final class Links {
  private CompletableFuture<String> connection; // violation: CachedFutureKeepsFailure
  private CompletableFuture<String> retried;
  private CompletableFuture<String> fresh;
  private CompletableFuture<String> helped;

  public CompletableFuture<String> connect() {
    if (connection == null) {
      connection = CompletableFuture.supplyAsync(() -> "link");
    }
    return connection;
  }

  public CompletableFuture<String> reconnect() {
    if (retried == null) {
      CompletableFuture<String> attempt = CompletableFuture.supplyAsync(() -> "link");
      retried = attempt;
      attempt.whenComplete((value, error) -> {
        if (error != null && retried == attempt) {
          retried = null;
        }
      });
    }
    return retried;
  }

  public CompletableFuture<String> help() {
    if (helped == null) {
      CompletableFuture<String> attempt = CompletableFuture.supplyAsync(() -> "link");
      helped = attempt;
      attempt.whenComplete((value, error) -> reset(attempt, error));
    }
    return helped;
  }

  private void reset(CompletableFuture<String> attempt, Throwable error) {
    if (error != null && helped == attempt) {
      helped = null;
    }
  }

  public CompletableFuture<String> open() {
    fresh = CompletableFuture.supplyAsync(() -> "link");
    return fresh;
  }
}
