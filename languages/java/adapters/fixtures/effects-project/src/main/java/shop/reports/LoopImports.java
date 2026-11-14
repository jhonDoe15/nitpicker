package shop.reports;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import shop.orders.Order;
import shop.orders.OrderLoader;
import shop.orders.OrderRepository;
import shop.prices.PriceSource;

public class LoopImports {
  private final OrderLoader loader;
  private final PriceSource prices;
  private final OrderRepository repository;

  public LoopImports(OrderLoader loader, PriceSource prices, OrderRepository repository) {
    this.loader = loader;
    this.prices = prices;
    this.repository = repository;
  }

  public List<Order> eachInLoop(List<Long> ids) {
    List<Order> orders = new ArrayList<>();
    for (Long id : ids) {
      orders.add(loader.load(id));
    }
    return orders;
  }

  public void eachInCallback(List<Long> ids) {
    ids.forEach(id -> loader.load(id));
  }

  public List<BigDecimal> pricesByReference(List<Long> ids) {
    return ids.stream().map(prices::priceOf).toList();
  }

  public List<Order> inParallel(List<Long> ids) {
    return ids.parallelStream().map(loader::load).toList();
  }

  public List<CompletableFuture<Order>> perElementFutures(List<Long> ids) {
    List<CompletableFuture<Order>> futures = new ArrayList<>();
    for (Long id : ids) {
      futures.add(CompletableFuture.supplyAsync(() -> loader.load(id)));
    }
    return futures;
  }

  public void directCall(List<Long> ids) {
    for (Long id : ids) {
      repository.findById(id);
    }
  }

  public void savedFromHelper(List<Long> ids) {
    for (Long id : ids) {
      repository.save(loader.load(id));
    }
  }

  public List<BigDecimal> chainedLookup(List<Long> ids) {
    List<BigDecimal> totals = new ArrayList<>();
    for (Long id : ids) {
      totals.add(repository
          .findById(id)
          .map(Order::getTotal)
          .orElseThrow());
    }
    return totals;
  }
}
