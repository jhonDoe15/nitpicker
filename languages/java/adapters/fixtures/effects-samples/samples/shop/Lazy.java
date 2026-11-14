package shop;

import java.util.ArrayList;
import java.util.List;

class Lazy {
  OrderRepository repo;

  String firstOnly() {
    return repo.findAll().get(0).getCustomer().getName();
  }

  List<String> names() {
    List<String> names = new ArrayList<>();
    for (Order order : repo.findAll()) {
      names.add(nameOf(order));
    }
    return names;
  }

  List<String> mapped() {
    return repo.findAll().stream().map(this::nameOf).toList();
  }

  String nameOf(Order order) {
    return order.getCustomer().getName();
  }
}
