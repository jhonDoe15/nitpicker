package shop.pooled;

import java.util.concurrent.CompletableFuture;

public final class LedgerReads {
  public interface Ledger {
    CompletableFuture<String> read(long entryId);

    CompletableFuture<Void> closeAsync();
  }

  public interface Ledgers {
    CompletableFuture<Ledger> open(long id);
  }

  private final Ledgers ledgers;
  private Ledger cached;

  public LedgerReads(Ledgers ledgers) {
    this.ledgers = ledgers;
  }

  public CompletableFuture<String> readOnSuccess(long id, long entryId) {
    return ledgers.open(id)
        .thenCompose(ledger -> ledger.read(entryId) // violation: HandleReleasedOnlyOnSuccess
            .thenCompose(entry -> ledger.closeAsync().thenApply(ignore -> entry)));
  }

  public CompletableFuture<String> readThenClose(long id, long entryId) {
    return ledgers.open(id)
        .thenCompose(ledger -> ledger.read(entryId) // violation: HandleReleasedOnlyOnSuccess
            .thenApply(entry -> {
              ledger.closeAsync();
              return entry;
            }));
  }

  public CompletableFuture<String> readAlwaysClosed(long id, long entryId) {
    return ledgers.open(id)
        .thenCompose(ledger -> ledger.read(entryId)
            .whenComplete((entry, error) -> ledger.closeAsync()));
  }

  public CompletableFuture<String> readClosedBothWays(long id, long entryId) {
    return ledgers.open(id)
        .thenCompose(ledger -> ledger.read(entryId)
            .handle((entry, error) -> {
              ledger.closeAsync();
              return entry;
            }));
  }

  public CompletableFuture<Void> remember(long id) {
    return ledgers.open(id)
        .thenCompose(ledger -> {
          this.cached = ledger;
          return ledger.read(0).thenAccept(entry -> cached.closeAsync());
        });
  }

  public CompletableFuture<Void> handOver(long id, CompletableFuture<Ledger> owner) {
    return ledgers.open(id)
        .thenCompose(ledger -> ledger.read(0).thenAccept(entry -> {
          if (!owner.complete(ledger)) {
            ledger.closeAsync();
          }
        }));
  }

  public CompletableFuture<String> readFirst(long id) {
    return ledgers.open(id).thenCompose(ledger -> ledger.read(0));
  }
}
