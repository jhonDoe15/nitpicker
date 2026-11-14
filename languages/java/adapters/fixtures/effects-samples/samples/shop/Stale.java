package shop;

import jakarta.persistence.EntityManager;
import jakarta.persistence.OptimisticLockException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import org.springframework.retry.annotation.Retryable;
import reactor.core.publisher.Mono;
import reactor.util.retry.Retry;

interface Parcels extends ReactiveCrudRepository<Order, Long> {}

class Stale {
  Parcels parcels;
  OrderRepository orders;
  EntityManager manager;

  Mono<Order> resend(Order order) {
    return parcels.save(order).retryWhen(Retry.max(3).filter(OptimisticLockingFailureException.class::isInstance));
  }

  Mono<Order> captured(Order order) {
    return Mono.defer(() -> parcels.save(order)).retryWhen(Retry.max(3).filter(e -> e instanceof OptimisticLockException));
  }

  Mono<Order> reread(Long id) {
    return Mono.defer(() -> parcels.findById(id).flatMap(found -> parcels.save(found)))
        .retryWhen(Retry.max(3).filter(OptimisticLockingFailureException.class::isInstance));
  }

  Mono<Order> otherRetry(Order order) {
    return parcels.save(order).retryWhen(Retry.max(3));
  }

  Mono<Order> unrelatedMention(Order order) {
    return parcels.save(order)
        .onErrorResume(OptimisticLockingFailureException.class, e -> Mono.empty())
        .retryWhen(Retry.max(3).filter(e -> e instanceof IllegalStateException));
  }

  Order loopRefresh(Long id) {
    Order loaded = orders.findById(id).orElseThrow();
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return orders.save(loaded);
      } catch (OptimisticLockingFailureException conflict) {
        manager.refresh(loaded);
      }
    }
    return loaded;
  }

  Order loop(Order order) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return orders.save(order);
      } catch (OptimisticLockingFailureException conflict) {
        continue;
      }
    }
    return order;
  }

  Order loopBeforeLoop(Long id) {
    Order loaded = orders.findById(id).orElseThrow();
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return orders.save(loaded);
      } catch (OptimisticLockException conflict) {
        continue;
      }
    }
    return loaded;
  }

  Order loopReread(Long id) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        Order fresh = orders.findById(id).orElseThrow();
        return orders.save(fresh);
      } catch (OptimisticLockingFailureException conflict) {
        continue;
      }
    }
    return null;
  }

  Order loopOtherFailure(Order order) {
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        return orders.save(order);
      } catch (IllegalStateException other) {
        continue;
      }
    }
    return order;
  }

  @Retryable(retryFor = OptimisticLockingFailureException.class)
  Order annotated(Order order) {
    return orders.save(order);
  }

  @Retryable(retryFor = OptimisticLockingFailureException.class)
  Order annotatedReread(Long id) {
    return orders.save(orders.findById(id).orElseThrow());
  }

  @Retryable(retryFor = IllegalStateException.class)
  Order annotatedOther(Order order) {
    return orders.save(order);
  }
}
