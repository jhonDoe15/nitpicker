package shop.collections;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public final class Pipelines {
  public record Order(String id, boolean paid, int total) {}

  private final List<Order> orders;

  public Pipelines(List<Order> orders) {
    this.orders = List.copyOf(orders);
  }

  public boolean anyPaid() {
    return orders.stream().filter(Order::paid).findFirst().isPresent(); // violation: RedundantStreamStep
  }

  public boolean nonePaid() {
    return orders.stream().filter(Order::paid).findAny().isEmpty(); // violation: RedundantStreamStep
  }

  public boolean anyLarge() {
    return orders.stream().filter(order -> order.total() > 100).count() > 0; // violation: RedundantStreamStep
  }

  public boolean someLarge() {
    return orders.stream().filter(order -> order.total() > 100).count() >= 1; // violation: RedundantStreamStep
  }

  public int paidCount() {
    return orders.stream().filter(Order::paid).toList().size(); // violation: RedundantStreamStep
  }

  public boolean noneOpen() {
    return orders.stream().filter(order -> !order.paid()).collect(Collectors.toList()).isEmpty(); // violation: RedundantStreamStep
  }

  public boolean anyOpen() {
    return 0 < orders.stream().filter(order -> !order.paid()).count(); // violation: RedundantStreamStep
  }

  public int copiedSize(Collection<String> ids) {
    return new ArrayList<>(ids).size(); // violation: RedundantStreamStep
  }

  public long relisted() {
    return orders.stream().map(Order::id).toList().stream().distinct().count();
  }

  public boolean copiedContains(Collection<String> ids, String id) {
    return new ArrayList<>(ids).contains(id);
  }

  public long copiedStream(Collection<Order> incoming) {
    return new ArrayList<>(incoming).stream().filter(Order::paid).count();
  }

  public boolean matched() {
    return orders.stream().anyMatch(Order::paid);
  }

  public long paidTotal() {
    return orders.stream().filter(Order::paid).count();
  }

  public Order firstPaid() {
    return orders.stream().filter(Order::paid).findFirst().orElseThrow();
  }

  public int distinctIds() {
    return orders.stream().map(Order::id).collect(Collectors.toSet()).size();
  }

  public List<Order> paid() {
    return orders.stream().filter(Order::paid).toList();
  }

  public List<String> snapshot(Collection<String> ids) {
    List<String> copy = new ArrayList<>(ids);
    copy.add("extra");
    return copy;
  }

  public int sized() {
    return new ArrayList<Order>(16).size();
  }

  public void drain(Set<String> ids) {
    for (String id : new ArrayList<>(ids)) {
      ids.remove(id);
    }
  }
}
