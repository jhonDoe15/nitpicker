package org.springframework.data.repository.reactive;

import org.springframework.data.repository.Repository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

public interface ReactiveCrudRepository<T, ID> extends Repository<T, ID> {
  Mono<T> findById(ID id);

  Flux<T> findAllById(Iterable<ID> ids);

  Flux<T> findAll();
}
