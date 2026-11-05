package shop;

import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

public final class Deadlines {
  private final ExecutorService pool = Executors.newFixedThreadPool(2);

  public String giveUp(Callable<String> work) throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS); // violation: timeout-abandons-operation
    } catch (TimeoutException e) {
      return "late";
    }
  }

  public String giveUpInAMultiCatch(Callable<String> work) {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS); // violation: timeout-abandons-operation
    } catch (InterruptedException | ExecutionException | TimeoutException e) {
      return "failed";
    }
  }

  public CompletableFuture<String> boundedAsync(Supplier<String> work) {
    return CompletableFuture.supplyAsync(work, pool).orTimeout(1, TimeUnit.SECONDS); // violation: timeout-abandons-operation
  }

  public CompletableFuture<String> boundedStage(Supplier<String> work) {
    return CompletableFuture.supplyAsync(work) // violation: timeout-abandons-operation
        .thenApply(String::trim)
        .completeOnTimeout("late", 1, TimeUnit.SECONDS);
  }

  public CompletableFuture<Void> boundedVariable(Runnable work) {
    CompletableFuture<Void> future = CompletableFuture.runAsync(work);
    return future.orTimeout(1, TimeUnit.SECONDS); // violation: timeout-abandons-operation
  }

  public String cancelOnTimeout(Callable<String> work)
      throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
      future.cancel(true);
      return "late";
    }
  }

  public String cancelInFinally(Callable<String> work)
      throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
      return "late";
    } finally {
      future.cancel(true);
    }
  }

  public String rethrowToTheOwner(Callable<String> work) {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS);
    } catch (InterruptedException | ExecutionException | TimeoutException e) {
      throw new IllegalStateException(e);
    }
  }

  public String propagate(Callable<String> work)
      throws InterruptedException, ExecutionException, TimeoutException {
    return pool.submit(work).get(1, TimeUnit.SECONDS);
  }

  public String shutDownOnTimeout(Callable<String> work)
      throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
      pool.shutdownNow();
      return "late";
    }
  }

  public String shutDownLetsTheTaskFinish(Callable<String> work)
      throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS); // violation: timeout-abandons-operation
    } catch (TimeoutException e) {
      pool.shutdown();
      return "late";
    }
  }

  public String cancelWithoutInterrupt(Callable<String> work)
      throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS); // violation: timeout-abandons-operation
    } catch (TimeoutException e) {
      future.cancel(false);
      return "late";
    }
  }

  public String interruptTheWaiter(Callable<String> work)
      throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS); // violation: timeout-abandons-operation
    } catch (TimeoutException e) {
      Thread.currentThread().interrupt();
      return "late";
    }
  }

  public String cancelAsyncTask(Supplier<String> work)
      throws InterruptedException, ExecutionException {
    CompletableFuture<String> future = CompletableFuture.supplyAsync(work);
    try {
      return future.get(1, TimeUnit.SECONDS); // violation: timeout-abandons-operation
    } catch (TimeoutException e) {
      future.cancel(true);
      return "late";
    }
  }

  public String cancelAfterTheTry(Callable<String> work)
      throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    String result = null;
    try {
      result = future.get(1, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
      result = null;
    }
    if (result == null) {
      future.cancel(true);
    }
    return result;
  }

  public String handToAHelper(Callable<String> work)
      throws InterruptedException, ExecutionException {
    Future<String> future = pool.submit(work);
    try {
      return future.get(1, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
      stop(future);
      return "late";
    }
  }

  public String interruptTheWorker(FutureTask<String> task)
      throws InterruptedException, ExecutionException {
    Thread worker = new Thread(task);
    worker.start();
    try {
      return task.get(1, TimeUnit.SECONDS);
    } catch (TimeoutException e) {
      worker.interrupt();
      return "late";
    }
  }

  private static void stop(Future<?> future) {
    future.cancel(true);
  }

  public CompletableFuture<String> boundedGivenFuture(CompletableFuture<String> given) {
    return given.orTimeout(1, TimeUnit.SECONDS);
  }

  public CompletableFuture<String> boundedManualFuture() {
    CompletableFuture<String> future = new CompletableFuture<>();
    return future.orTimeout(1, TimeUnit.SECONDS);
  }
}
