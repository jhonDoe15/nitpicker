package shop;

import jakarta.persistence.EntityManager;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;

class Batches {
  EntityManager em;
  OrderRepository repo;
  ExecutorService executor;
  List<Future<Order>> pending = new ArrayList<>();

  void flushedEveryFifty(List<Order> orders) {
    int count = 0;
    for (Order order : orders) {
      em.persist(order);
      if (++count % 50 == 0) {
        em.flush();
        em.clear();
      }
    }
  }

  void persistedEach(List<Order> orders) {
    for (Order order : orders) {
      em.persist(order);
    }
  }

  void accumulatedThenQueried(List<Long> ids) {
    List<Long> batch = new ArrayList<>();
    for (long id : ids) {
      batch.add(id);
      if (batch.size() == 100) {
        repo.findByIdIn(batch);
        batch = new ArrayList<>();
      }
    }
  }

  void freshListEachTime(List<Long> ids) {
    for (long id : ids) {
      List<Long> one = new ArrayList<>();
      one.add(id);
      repo.findByIdIn(one);
    }
  }

  List<CompletableFuture<Order>> collectedFutures(List<Long> ids) {
    List<CompletableFuture<Order>> out = new ArrayList<>();
    for (long id : ids) {
      out.add(CompletableFuture.supplyAsync(() -> repo.findById(id).orElseThrow()));
    }
    return out;
  }

  List<CompletableFuture<Order>> streamedFutures(List<Long> ids) {
    return ids.stream().map(id -> CompletableFuture.supplyAsync(() -> repo.findById(id).orElseThrow())).toList();
  }

  void storedFutures(List<Long> ids) {
    for (long id : ids) {
      pending.add(executor.submit(() -> repo.findById(id).orElseThrow()));
    }
  }
}
