package shop;

import java.util.List;
import java.util.stream.Stream;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

interface ReactiveOrders extends ReactiveCrudRepository<Order, Long> {}

class Reactive {
  ReactiveOrders orders;
  PriceClient prices;

  Flux<Order> byReference(List<Long> ids) {
    return Flux.fromIterable(ids).flatMap(orders::findById);
  }

  Flux<Order> byLambda(List<Long> ids) {
    return Flux.fromIterable(ids).filter(id -> id > 0).flatMapSequential(id -> orders.findById(id));
  }

  Flux<Mono<Order>> byHelper(Stream<Long> ids) {
    return Flux.fromStream(ids).map(this::lookup);
  }

  Flux<Order> fromArray(Long[] ids) {
    return Flux.fromArray(ids).concatMap(id -> orders.findById(id));
  }

  Flux<String> remote(List<Long> ids) {
    return Flux.fromIterable(ids).map(id -> Mono.just(prices.priceOf(id))).flatMap(price -> Mono.just("x"));
  }

  Flux<Order> batched(List<Long> ids) {
    return orders.findAllById(ids);
  }

  Flux<String> noLookup(List<Long> ids) {
    return Flux.fromIterable(ids).map(id -> "order-" + id);
  }

  Flux<Order> fromDatabase() {
    return orders.findAll().map(order -> order);
  }

  Flux<List<Order>> buffered(List<Long> ids) {
    return Flux.fromIterable(ids).buffer(100).flatMap(batch -> orders.findAllById(batch).collectList());
  }

  Flux<Order> limitedDatabase(List<Long> ids) {
    return Flux.fromIterable(ids).flatMap(id -> orders.findById(id), 8);
  }

  Flux<String> limitedRemote(List<Long> ids) {
    return Flux.fromIterable(ids).flatMap(id -> Mono.just(prices.priceOf(id)), 8);
  }

  Mono<Order> lookup(Long id) {
    return orders.findById(id);
  }
}
