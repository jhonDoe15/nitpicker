package shop.reports;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import shop.orders.Order;

public class Accumulators {
  public List<Order> concatenated(List<Order> orders) {
    List<Order> all = List.of();
    for (Order order : orders) {
      all = Stream.concat(all.stream(), Stream.of(order)).toList();
    }
    return all;
  }

  public List<Order> reduced(List<Order> orders) {
    return orders.stream().reduce(List.of(), (List<Order> acc, Order order) -> {
      List<Order> next = new ArrayList<>(acc);
      next.add(order);
      return next;
    }, (left, right) -> left);
  }

  public Map<Long, Order> copiedMap(List<Order> orders) {
    Map<Long, Order> byId = new HashMap<>();
    for (Order order : orders) {
      byId = new HashMap<>(byId);
      byId.put(order.getId(), order);
    }
    return byId;
  }

  public List<Order> collected(List<Order> orders) {
    return orders.stream().filter(order -> order.getTotal() != null).collect(Collectors.toList());
  }

  public List<Order> filled(List<Order> orders) {
    List<Order> all = new ArrayList<>();
    for (Order order : orders) {
      all.add(order);
    }
    return all;
  }

  public int[] grown(int count) {
    int[] values = new int[4];
    for (int index = 0; index < count; index++) {
      if (index == values.length) {
        values = Arrays.copyOf(values, values.length * 2);
      }
      values[index] = index;
    }
    return values;
  }

  public List<Long> flattened(List<List<Order>> groups) {
    return groups.stream().flatMap(List::stream).map(Order::getId).toList();
  }
}
