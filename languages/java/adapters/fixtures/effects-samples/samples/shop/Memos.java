package shop;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

class Memos {
  OrderRepository repo;
  Map<Long, Order> byId = new ConcurrentHashMap<>();

  void doubleChecked(List<Model> items, Model target) {
    for (Model item : items) {
      item.equals(target);
    }
  }

  void plainFlag(List<Settings> items) {
    for (Settings item : items) {
      item.ready();
    }
  }

  void singleton(List<Order> orders) {
    for (Order order : orders) {
      Registry.instance().names(order);
    }
  }

  void byClass(List<Order> orders) {
    for (Order order : orders) {
      Caches.all();
    }
  }

  void constantKey(List<Order> orders) {
    for (Order order : orders) {
      Caches.named();
    }
  }

  void holder(List<Order> orders) {
    for (Order order : orders) {
      Holder.all();
    }
  }

  void relationOfItem(List<Reading> items, Reading target) {
    for (Reading item : items) {
      item.equals(target);
    }
  }

  void afterTheMemo(List<Model> items) {
    for (Model item : items) {
      item.refreshed();
    }
  }

  void dirtyOr(List<Drifting> items) {
    for (Drifting item : items) {
      item.orders();
    }
  }

  void dirtyAnd(List<Drifting> items) {
    for (Drifting item : items) {
      item.reloaded();
    }
  }

  void afterInit(List<Order> orders) {
    for (Order order : orders) {
      Drifting.fresh();
    }
  }

  void keyedByItem(List<Order> orders) {
    for (Order order : orders) {
      byId.computeIfAbsent(order.getId(), this::load);
    }
  }

  Order load(Long id) {
    return repo.findById(id).orElse(null);
  }
}

class Model {
  static OrderRepository known;
  private static volatile List<Order> metadata;

  static List<Order> metadata() {
    if (metadata == null) {
      synchronized (Model.class) {
        if (metadata == null) {
          metadata = known.findAll();
        }
      }
    }
    return metadata;
  }

  @Override
  public boolean equals(Object other) {
    return metadata().contains(other);
  }

  @Override
  public int hashCode() {
    return 1;
  }

  List<Order> refreshed() {
    metadata();
    return known.findAll();
  }
}

class Drifting {
  static OrderRepository known;
  private static List<Order> meta;
  private static List<Order> seen;
  boolean dirty;

  List<Order> orders() {
    if (meta == null || dirty) {
      meta = known.findAll();
    }
    return meta;
  }

  List<Order> reloaded() {
    if (seen == null && known.count() > 0) {
      seen = List.of();
    }
    return seen;
  }

  static List<Order> fresh() {
    if (seen == null) {
      seen = List.of();
    }
    return known.findAll();
  }
}

class Reading {
  static OrderRepository known;
  Long id;

  @Override
  public boolean equals(Object other) {
    return Model.metadata().isEmpty() && known.findById(id).isPresent();
  }

  @Override
  public int hashCode() {
    return 1;
  }
}

class Settings {
  static OrderRepository known;
  private static boolean loaded;
  private static List<Order> orders;

  boolean ready() {
    if (!loaded) {
      orders = known.findAll();
      loaded = true;
    }
    return orders.isEmpty();
  }
}

class Registry {
  private static Registry instance;
  private final List<Order> orders;

  private Registry(OrderRepository repo) {
    this.orders = repo.findAll();
  }

  static Registry instance() {
    if (instance == null) {
      instance = new Registry(Model.known);
    }
    return instance;
  }

  String names(Order order) {
    return String.valueOf(orders.contains(order));
  }
}

class Caches {
  private static final Map<Class<?>, List<Order>> BY_CLASS = new ConcurrentHashMap<>();
  private static final Map<String, List<Order>> BY_NAME = new ConcurrentHashMap<>();
  private static final String SCOPE = "all";

  static List<Order> all() {
    return BY_CLASS.computeIfAbsent(Order.class, type -> Model.known.findAll());
  }

  static List<Order> named() {
    return BY_NAME.computeIfAbsent(SCOPE, name -> Model.known.findAll());
  }
}

class Holder {
  static final List<Order> ALL = Model.known.findAll();

  static List<Order> all() {
    return ALL;
  }

  static class Instance {
    static final Holder INSTANCE = new Holder();
  }
}
