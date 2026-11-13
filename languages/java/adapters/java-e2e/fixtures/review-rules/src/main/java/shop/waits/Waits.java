package shop.waits;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

public final class Waits {
  private Waits() {}

  static String futureGet(Future<String> future) throws ExecutionException, InterruptedException {
    return future.get(); // violation: UnboundedWait
  }

  static String submittedGet(ExecutorService executor, Callable<String> task)
      throws ExecutionException, InterruptedException {
    return executor.submit(task).get(); // violation: UnboundedWait
  }

  static String taskGet(FutureTask<String> task) throws ExecutionException, InterruptedException {
    return task.get(); // violation: UnboundedWait
  }

  static String completableJoin(CompletableFuture<String> future) {
    return future.join(); // violation: UnboundedWait
  }

  static String completableGet(CompletableFuture<String> future)
      throws ExecutionException, InterruptedException {
    return future.get(); // violation: UnboundedWait
  }

  static void latchAwait(CountDownLatch done) throws InterruptedException {
    done.await(); // violation: UnboundedWait
  }

  static void threadJoin(Thread worker) throws InterruptedException {
    worker.join(); // violation: UnboundedWait
  }

  static String futureGetWithADeadline(Future<String> future)
      throws ExecutionException, InterruptedException, TimeoutException {
    return future.get(30, TimeUnit.SECONDS);
  }

  static String completableWithADeadline(CompletableFuture<String> future) {
    return future.orTimeout(30, TimeUnit.SECONDS).join();
  }

  static String completableWithADefault(CompletableFuture<String> future) {
    return future.completeOnTimeout("none", 30, TimeUnit.SECONDS).join();
  }

  static boolean latchWithADeadline(CountDownLatch done) throws InterruptedException {
    return done.await(30, TimeUnit.SECONDS);
  }

  static void threadJoinWithADeadline(Thread worker) throws InterruptedException {
    worker.join(30_000);
  }

  static void joinsFuturesThatAreDone(ExecutorService executor, List<Callable<String>> tasks)
      throws ExecutionException, InterruptedException {
    for (Future<String> done : executor.invokeAll(tasks, 30, TimeUnit.SECONDS)) {
      done.get();
    }
  }

  static String joinsAString(List<String> parts) {
    return String.join(",", parts);
  }

  static void threadJoinWithZero(Thread worker) throws InterruptedException {
    worker.join(0); // violation: UnboundedWait
  }

  static String completableChainWithADeadline(CompletableFuture<String> future) {
    return future.orTimeout(30, TimeUnit.SECONDS).thenApply(value -> value + "!").join();
  }

  static String completableLocalWithADeadline(CompletableFuture<String> future) {
    CompletableFuture<String> bounded = future.orTimeout(30, TimeUnit.SECONDS);
    return bounded.join();
  }

  static String joinsAfterAllOf(CompletableFuture<String> first, CompletableFuture<String> second) {
    return CompletableFuture.allOf(first, second).thenApply(done -> first.join() + second.join()).join(); // violation: UnboundedWait
  }
}
