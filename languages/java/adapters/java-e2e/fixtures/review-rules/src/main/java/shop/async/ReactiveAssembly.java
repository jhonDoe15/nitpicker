package shop.async;

import org.reactivestreams.Publisher;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public final class ReactiveAssembly {
  private final CacheEvictions evictions = new CacheEvictions();

  static final class CacheEvictions {
    void evict(Object key) {
      key.hashCode();
    }
  }

  Mono<String> generate(ServerWebExchange exchange) {
    return Mono.justOrEmpty(exchange.getRequest().getURI().getQuery());
  }

  Flux<?> cacheAspectSubscribesAndReturns(Publisher<String> publisher) {
    Flux<?> source = Flux.from(publisher).publish().refCount(2);
    source.subscribe(evictions::evict); // violation: ReactiveSubscribeAndReturn
    return source;
  }

  Flux<String> subscribesAParameterAndReturnsAChain(Flux<String> input) {
    input.subscribe(evictions::evict); // violation: ReactiveSubscribeAndReturn
    return input.map(String::trim);
  }

  Flux<?> subscribesInsideDefer(Publisher<String> publisher) {
    return Flux.defer(
        () -> {
          Flux<?> source = Flux.from(publisher).publish().refCount(2);
          source.subscribe(evictions::evict);
          return source;
        });
  }

  Flux<String> sharesTheSource(Publisher<String> publisher) {
    Flux<String> source = Flux.from(publisher).share();
    source.subscribe(evictions::evict);
    return source;
  }

  Flux<String> cachesTheSource(Publisher<String> publisher) {
    Flux<String> source = Flux.from(publisher).cache();
    source.subscribe(evictions::evict);
    return source;
  }

  Flux<String> subscribesALoggedCopy(Flux<String> input) {
    input.map(String::trim).subscribe(evictions::evict);
    return input;
  }

  void subscribesWithoutReturning(Flux<String> input) {
    input.subscribe(evictions::evict);
  }

  Mono<String> eagerFilterChain(ServerWebExchange exchange, WebFilterChain chain) {
    return generate(exchange)
        .switchIfEmpty(
            chain.filter(exchange) // violation: ReactiveEagerFallback
                .then(Mono.empty()));
  }

  Mono<Void> eagerFilterChainDirectly(ServerWebExchange exchange, WebFilterChain chain) {
    return generate(exchange)
        .then(Mono.<Void>empty())
        .switchIfEmpty(chain.filter(exchange)); // violation: ReactiveEagerFallback
  }

  Mono<String> deferredFilterChain(ServerWebExchange exchange, WebFilterChain chain) {
    return generate(exchange)
        .switchIfEmpty(Mono.defer(() -> chain.filter(exchange).then(Mono.empty())));
  }

  Mono<String> pureFallback(ServerWebExchange exchange) {
    return generate(exchange).switchIfEmpty(Mono.just("none"));
  }

  Mono<Void> filterChainAfterTheWork(ServerWebExchange exchange, WebFilterChain chain) {
    return generate(exchange).then(chain.filter(exchange));
  }
}
