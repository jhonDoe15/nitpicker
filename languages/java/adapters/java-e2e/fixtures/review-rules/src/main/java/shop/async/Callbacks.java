package shop.async;

import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executor;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public final class Callbacks {
  private final BlockingQueue<String> outbox;
  private final Semaphore permits = new Semaphore(4);
  private final Executor executor;

  public Callbacks(BlockingQueue<String> outbox, Executor executor) {
    this.outbox = outbox;
    this.executor = executor;
  }

  CompletableFuture<String> load(String key) {
    return CompletableFuture.completedFuture(key);
  }

  CompletableFuture<Void> writeReport(String key) {
    return load(key)
        .thenAccept(
            name -> {
              CompletableFuture<String> report = load(name + "-report");
              report.orTimeout(5, TimeUnit.SECONDS).join(); // violation: BlockingInCompletionStage
            });
  }

  CompletableFuture<String> readsTheMetadata(String key, CompletableFuture<String> metadata) {
    return load(key)
        .thenApply(
            name -> {
              try {
                return metadata.get(5, TimeUnit.SECONDS); // violation: BlockingInCompletionStage
              } catch (InterruptedException | ExecutionException | TimeoutException e) {
                throw new IllegalStateException(name, e);
              }
            });
  }

  CompletableFuture<Void> waitsForTheLatch(String key, CountDownLatch ready) {
    return load(key)
        .thenRun(
            () -> {
              try {
                ready.await(5, TimeUnit.SECONDS); // violation: BlockingInCompletionStage
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            });
  }

  CompletableFuture<Void> handsOverToTheQueue(String key) {
    return load(key)
        .thenAccept(
            name -> {
              try {
                outbox.put(name); // violation: BlockingInCompletionStage
                permits.acquire(); // violation: BlockingInCompletionStage
                Thread.sleep(10); // violation: BlockingInCompletionStage
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            });
  }

  CompletableFuture<Void> usesAnExecutor(String key, CompletableFuture<String> metadata) {
    return load(key).thenAcceptAsync(name -> metadata.orTimeout(5, TimeUnit.SECONDS).join(), executor);
  }

  CompletableFuture<String> composesTheNextStage(String key, CompletableFuture<String> metadata) {
    return load(key).thenCompose(name -> metadata);
  }

  String readsACompletedFuture(String key, CompletableFuture<String> metadata) {
    return load(key).thenApply(name -> metadata.getNow(name)).orTimeout(5, TimeUnit.SECONDS).join();
  }

  CompletableFuture<Integer> joinsWhatTheSourceAlreadyCompleted(String key) {
    CompletableFuture<String> first = load(key);
    CompletableFuture<String> second = load(key + "-2");
    return CompletableFuture.allOf(first, second)
        .thenApply(done -> first.join().length() + second.join().length());
  }

  CompletableFuture<Integer> joinsTheStageInput(String key) {
    return load(key).thenCombine(load(key + "-2"), (left, right) -> left.length() + right.length());
  }

  CompletableFuture<Void> readsAfterTheDoneCheck(String key, CompletableFuture<String> metadata) {
    return load(key)
        .thenAccept(
            name -> {
              if (metadata.isDone()) {
                metadata.orTimeout(5, TimeUnit.SECONDS).join();
              }
            });
  }

  CompletableFuture<Integer> joinsTheElementsOfADoneList(String key, List<CompletableFuture<String>> parts) {
    return load(key)
        .thenApply(
            name -> {
              int length = 0;
              for (CompletableFuture<String> part : parts) {
                length += part.orTimeout(5, TimeUnit.SECONDS).join().length();
              }
              return length;
            });
  }

  CompletableFuture<Void> blocksOnAnotherThread(String key, CompletableFuture<String> metadata) {
    return load(key).thenAccept(name -> executor.execute(() -> metadata.orTimeout(5, TimeUnit.SECONDS).join()));
  }

  CompletableFuture<Void> waitsOutsideAStage(String key, CompletableFuture<String> metadata) {
    metadata.orTimeout(5, TimeUnit.SECONDS).join();
    return load(key).thenAccept(name -> name.length());
  }

  CompletableFuture<Void> readsAFutureThatIsAlreadyDone(String key) {
    CompletableFuture<String> done = CompletableFuture.completedFuture(key);
    return load(key).thenAccept(name -> done.orTimeout(5, TimeUnit.SECONDS).join());
  }

  CompletableFuture<Void> putsOnAnUnboundedQueue(String key) {
    LinkedBlockingQueue<String> pending = new LinkedBlockingQueue<>();
    return load(key)
        .thenAccept(
            name -> {
              try {
                pending.put(name);
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            });
  }

  CompletableFuture<Void> yieldsTheThread(String key) {
    return load(key)
        .thenRun(
            () -> {
              try {
                Thread.sleep(0);
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            });
  }
}
