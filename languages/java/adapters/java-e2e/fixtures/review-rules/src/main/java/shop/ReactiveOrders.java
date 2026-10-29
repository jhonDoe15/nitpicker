package shop;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Semaphore;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

public final class ReactiveOrders {
  private final Semaphore permits = new Semaphore(1);

  Mono<Path> paths() {
    return Mono.empty();
  }

  Mono<String> names() {
    return Mono.empty();
  }

  Flux<CompletableFuture<String>> futures() {
    return Flux.empty();
  }

  Mono<Boolean> checksInMap() {
    return paths().map(path -> Files.exists(path)); // violation: ReactorBlockingInOperator
  }

  Mono<String> sleepsInDoOnNext() {
    return names()
        .doOnNext(
            name -> {
              try {
                Thread.sleep(10); // violation: ReactorBlockingInOperator
              } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
              }
            });
  }

  Mono<String> blocksInFlatMap(Mono<String> other) {
    return names().flatMap(name -> Mono.just(other.block())); // violation: ReactorBlockingInOperator
  }

  Flux<String> joinsAFuture() {
    return futures().map(future -> future.join()); // violation: ReactorBlockingInOperator
  }

  Mono<String> acquiresAPermit() {
    return names()
        .map(
            name -> {
              permits.acquireUninterruptibly(); // violation: ReactorBlockingInOperator
              return name;
            });
  }

  Mono<byte[]> opensAFile() {
    return names()
        .map(
            name -> {
              try (FileInputStream in = new FileInputStream(name)) { // violation: ReactorBlockingInOperator
                return in.readAllBytes(); // violation: ReactorBlockingInOperator
              } catch (IOException e) {
                throw new IllegalStateException(e);
              }
            });
  }

  Mono<Boolean> stillBlocksOnTheParallelScheduler() {
    return paths().publishOn(Schedulers.parallel()).map(path -> Files.exists(path)); // violation: ReactorBlockingInOperator
  }

  Mono<String> blocksInAReactiveMethod(Mono<String> other) {
    String value = other.block(); // violation: ReactorBlockInReactiveMethod
    return Mono.just(value);
  }

  Mono<Boolean> movesTheCheckToBoundedElastic() {
    return paths()
        .flatMap(
            path ->
                Mono.fromCallable(() -> Files.exists(path))
                    .subscribeOn(Schedulers.boundedElastic()));
  }

  Mono<Boolean> publishesOnBoundedElastic() {
    return paths().publishOn(Schedulers.boundedElastic()).map(path -> Files.exists(path));
  }

  Mono<Boolean> subscribesOnBoundedElastic() {
    return paths().map(path -> Files.exists(path)).subscribeOn(Schedulers.boundedElastic());
  }

  Mono<Boolean> reuseOfAPublisherThatMayBeOffloaded() {
    Mono<Path> offloaded = paths().subscribeOn(Schedulers.boundedElastic());
    return offloaded.map(path -> Files.exists(path));
  }

  Mono<String> pureOperators() {
    return names().map(String::trim).map(name -> name.toUpperCase());
  }

  boolean checksOutsideAReactiveChain(Path path) {
    return Files.exists(path);
  }

  String blocksOutsideAReactiveMethod(Mono<String> other) {
    return other.block();
  }

  Mono<String> blocksInASourceSupplier(Mono<String> other) {
    return Mono.fromSupplier(() -> other.block());
  }
}
