package e;

import static com.google.common.util.concurrent.Futures.immediateFuture;
import static com.google.common.util.concurrent.Futures.transformAsync;

import com.google.common.util.concurrent.ClosingFuture;
import com.google.common.util.concurrent.FluentFuture;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import java.io.IOException;
import java.util.concurrent.Executor;

public class S22FutureAsync {
  Executor executor;

  ListenableFuture<String> foo(String s) {
    return Futures.immediateFuture(s);
  }

  ListenableFuture<String> expression() {
    return Futures.transformAsync(Futures.immediateFuture(5), value -> Futures.immediateFuture("value: " + value), executor);
  }

  ListenableFuture<String> statements() {
    return Futures.transformAsync(
        Futures.immediateFuture(5),
        value -> {
          if (value > 10) {
            return Futures.immediateFuture("large");
          } else if (value > 5) {
            return Futures.immediateFuture("small");
          }
          return Futures.immediateFuture("value: " + value);
        },
        executor);
  }

  ListenableFuture<String> notAll() {
    return Futures.transformAsync(
        Futures.immediateFuture(5),
        value -> {
          if (value > 10) {
            return foo("x");
          }
          return Futures.immediateFuture("value: " + value);
        },
        executor);
  }

  String throwIfLarge(int value) throws IOException {
    if (value > 10) {
      throw new IOException();
    }
    return "ok";
  }

  ListenableFuture<String> throwsChecked() {
    return Futures.transformAsync(
        Futures.immediateFuture(5),
        value -> {
          if (value > 10) {
            throw new IOException();
          }
          return Futures.immediateFuture("value: " + value);
        },
        executor);
  }

  ListenableFuture<String> methodThrowsChecked() {
    return Futures.transformAsync(Futures.immediateFuture(5), value -> Futures.immediateFuture(throwIfLarge(value)), executor);
  }

  ListenableFuture<String> throwsUnchecked() {
    return Futures.transformAsync(
        Futures.immediateFuture(5),
        value -> {
          if (value > 10) {
            throw new IllegalStateException();
          }
          return Futures.immediateFuture("value: " + value);
        },
        executor);
  }

  ListenableFuture<String> staticImports() {
    return transformAsync(foo("x"), value -> immediateFuture("value: " + value), executor);
  }

  ListenableFuture<Void> voidFuture() {
    return Futures.transformAsync(foo("x"), value -> Futures.immediateVoidFuture(), executor);
  }

  ListenableFuture<Void> typeArgument() {
    return Futures.transformAsync(Futures.immediateFuture("x"), value -> Futures.<Void>immediateFuture(null), executor);
  }

  ListenableFuture<Void> nested() {
    return Futures.transformAsync(
        Futures.immediateFuture("x"),
        value -> {
          Runnable r = () -> {
            return;
          };
          Object o = new Object() {
            ListenableFuture<String> other() {
              return foo("y");
            }
          };
          return Futures.immediateVoidFuture();
        },
        executor);
  }

  ListenableFuture<String> executorLambda() {
    return Futures.transformAsync(foo("x"), value -> Futures.immediateFuture("v"), command -> command.run());
  }

  ListenableFuture<String> combiner() {
    return Futures.whenAllSucceed(foo("a"), foo("b")).callAsync(() -> Futures.immediateFuture("c"), executor);
  }

  ListenableFuture<String> combinerThrows() {
    return Futures.whenAllSucceed(foo("a")).callAsync(() -> {
      throw new IOException();
    }, executor);
  }

  ListenableFuture<String> combinerChecked() {
    return Futures.whenAllSucceed(foo("a")).callAsync(() -> Futures.immediateFuture(throwIfLarge(1)), executor);
  }

  ListenableFuture<String> submit() {
    return Futures.submitAsync(() -> Futures.immediateFuture("s"), executor);
  }

  FluentFuture<String> fluent(FluentFuture<String> future) {
    return future.transformAsync(value -> FluentFuture.immediateFuture(value + "x"), executor);
  }

  ClosingFuture<String> closing(ClosingFuture<String> future) {
    return future.transformAsync(value -> ClosingFuture.immediateFuture(value + "x"), executor);
  }

  @SuppressWarnings("FutureTransformAsync")
  ListenableFuture<String> suppressed() {
    return Futures.transformAsync(Futures.immediateFuture(5), value -> Futures.immediateFuture("v"), executor);
  }
}
