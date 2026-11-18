function toMap(name: string, index: number): string {
  const [first, second] = [`first${String(index)}`, `second${String(index)}`];
  return `Collectors.toMap(${name} -> ${name}.id(), Function.identity(), (${first}, ${second}) -> ${first})`;
}

const MAIN = 'src/main/java/demo';

export const LINEAR_LOOKUP_CASES = [
  {
    check: 'LinearLookupInLoop',
    file: `${MAIN}/LookupFixed.java`,
    before: `package demo;

import java.util.List;
import java.util.Optional;

public class LookupFixed {
  record Item(long id, String name, Kind kind) {}

  record Order(long itemId, String itemName, Kind kind) {}

  enum Kind {
    A,
    B
  }

  private static final List<Item> ITEMS = List.of(new Item(1, "a", Kind.A), new Item(2, "b", Kind.B));
  private final List<Item> own = List.of(new Item(3, "c", Kind.A));

  void find(List<Order> orders) {
    for (Order order : orders) {
      Optional<Item> item = ITEMS.stream().filter(candidate -> candidate.id() == order.itemId()).findFirst();
      System.out.println(item);
    }
  }

  void any(List<Order> orders) {
    for (Order order : orders) {
      if (ITEMS.stream().anyMatch(item -> item.name().equals(order.itemName()))) {
        System.out.println("hit");
      }
      if (ITEMS.stream().noneMatch(item -> order.itemName().equals(item.name()))) {
        System.out.println("miss");
      }
      if (this.own.stream().anyMatch(item -> item.kind().equals(order.kind()))) {
        System.out.println("kind");
      }
    }
  }

  void whileLoop(List<Order> orders) {
    List<Item> local = List.of(new Item(5, "e", Kind.B));
    int count = 0;
    while (count < orders.size()) {
      Order order = orders.get(count++);
      Item first = local.stream().filter(item -> item.id() == order.itemId()).findAny().orElse(null);
      Item second = local.stream().filter(item -> item.id() == order.itemId()).findFirst().get();
      System.out.println(first + " " + second);
    }
  }

  void nested(List<List<Order>> groups, long wanted) {
    for (List<Order> group : groups) {
      for (Order order : group) {
        System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId()));
      }
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == wanted));
    }
  }
}
`,
    after: `package demo;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

public class LookupFixed {
  record Item(long id, String name, Kind kind) {}

  record Order(long itemId, String itemName, Kind kind) {}

  enum Kind {
    A,
    B
  }

  private static final List<Item> ITEMS = List.of(new Item(1, "a", Kind.A), new Item(2, "b", Kind.B));
  private final List<Item> own = List.of(new Item(3, "c", Kind.A));

  void find(List<Order> orders) {
    Map<Long, Item> itemsById = ITEMS.stream().collect(${toMap('candidate', 2)});
    for (Order order : orders) {
      Optional<Item> item = Optional.ofNullable(itemsById.get(order.itemId()));
      System.out.println(item);
    }
  }

  void any(List<Order> orders) {
    Set<String> itemsNameSet = ITEMS.stream().map(item -> item.name()).collect(Collectors.toSet());
    Set<Kind> ownKindSet = this.own.stream().map(item -> item.kind()).collect(Collectors.toSet());
    for (Order order : orders) {
      if (itemsNameSet.contains(order.itemName())) {
        System.out.println("hit");
      }
      if (!itemsNameSet.contains(order.itemName())) {
        System.out.println("miss");
      }
      if (ownKindSet.contains(order.kind())) {
        System.out.println("kind");
      }
    }
  }

  void whileLoop(List<Order> orders) {
    List<Item> local = List.of(new Item(5, "e", Kind.B));
    int count = 0;
    Map<Long, Item> localById = local.stream().collect(${toMap('item', 3)});
    while (count < orders.size()) {
      Order order = orders.get(count++);
      Item first = Optional.ofNullable(localById.get(order.itemId())).orElse(null);
      Item second = Optional.ofNullable(localById.get(order.itemId())).get();
      System.out.println(first + " " + second);
    }
  }

  void nested(List<List<Order>> groups, long wanted) {
    Set<Long> itemsIdSet = ITEMS.stream().map(item -> item.id()).collect(Collectors.toSet());
    for (List<Order> group : groups) {
      Set<Long> itemsIdSet2 = ITEMS.stream().map(item -> item.id()).collect(Collectors.toSet());
      for (Order order : group) {
        System.out.println(itemsIdSet2.contains(order.itemId()));
      }
      System.out.println(itemsIdSet.contains(wanted));
    }
  }
}
`,
    lines: [20, 27, 43, 52],
  },
  {
    check: 'LinearLookupInLoop',
    file: `${MAIN}/LookupDeclined.java`,
    before: `package demo;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class LookupDeclined {
  record Item(long id, String name, double score, Kind kind) {}

  record Order(long itemId, String itemName, double score) {}

  enum Kind {
    A,
    B
  }

  private static final List<Item> ITEMS = List.of(new Item(1, "a", 1.5, Kind.A));
  private List<Item> mutable = new ArrayList<>();

  void collections(List<Order> orders, List<Item> parameter) {
    List<Item> local = new ArrayList<>();
    List<Item> copy = new ArrayList<>(ITEMS);
    for (Order order : orders) {
      System.out.println(parameter.stream().anyMatch(item -> item.id() == order.itemId()));
      System.out.println(local.stream().anyMatch(item -> item.id() == order.itemId()));
      System.out.println(copy.stream().anyMatch(item -> item.id() == order.itemId()));
      System.out.println(mutable.stream().anyMatch(item -> item.id() == order.itemId()));
      List<Item> inLoop = List.of();
      System.out.println(inLoop.stream().anyMatch(item -> item.id() == order.itemId()));
    }
  }

  void predicates(List<Order> orders) {
    for (Order order : orders) {
      System.out.println(ITEMS.stream().anyMatch(item -> item.name().equalsIgnoreCase(order.itemName())));
      System.out.println(ITEMS.stream().anyMatch(item -> item.name() == order.itemName()));
      System.out.println(ITEMS.stream().anyMatch(item -> item.kind() == Kind.A));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId() && item.kind() == Kind.A));
      System.out.println(ITEMS.stream().anyMatch(item -> Objects.equals(item.name(), order.itemName())));
      System.out.println(ITEMS.stream().anyMatch(item -> item.score() == order.score()));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId() + 1));
      System.out.println(ITEMS.stream().anyMatch(item -> item.name().equals(item.name())));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == ITEMS.size()));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == orders.get(0).itemId()));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == (int) order.itemId()));
      System.out.println(ITEMS.stream().filter(item -> item.id() == order.itemId()).count());
      System.out.println(ITEMS.stream().map(Item::id).anyMatch(id -> id == order.itemId()));
      System.out.println(ITEMS.stream().sorted().anyMatch(item -> item.id() == order.itemId()));
    }
  }

  void positions(List<Order> orders) {
    orders.forEach(order -> System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId())));
    for (Order order : orders) {
      Runnable later = () -> System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId()));
      later.run();
    }
    outer:
    for (Order order : orders) {
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId()));
      continue outer;
    }
    boolean once = ITEMS.stream().anyMatch(item -> item.id() == orders.size());
  }
}
`,
    after: `package demo;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class LookupDeclined {
  record Item(long id, String name, double score, Kind kind) {}

  record Order(long itemId, String itemName, double score) {}

  enum Kind {
    A,
    B
  }

  private static final List<Item> ITEMS = List.of(new Item(1, "a", 1.5, Kind.A));
  private List<Item> mutable = new ArrayList<>();

  void collections(List<Order> orders, List<Item> parameter) {
    List<Item> local = new ArrayList<>();
    List<Item> copy = new ArrayList<>(ITEMS);
    for (Order order : orders) {
      System.out.println(parameter.stream().anyMatch(item -> item.id() == order.itemId()));
      System.out.println(local.stream().anyMatch(item -> item.id() == order.itemId()));
      System.out.println(copy.stream().anyMatch(item -> item.id() == order.itemId()));
      System.out.println(mutable.stream().anyMatch(item -> item.id() == order.itemId()));
      List<Item> inLoop = List.of();
      System.out.println(inLoop.stream().anyMatch(item -> item.id() == order.itemId()));
    }
  }

  void predicates(List<Order> orders) {
    for (Order order : orders) {
      System.out.println(ITEMS.stream().anyMatch(item -> item.name().equalsIgnoreCase(order.itemName())));
      System.out.println(ITEMS.stream().anyMatch(item -> item.name() == order.itemName()));
      System.out.println(ITEMS.stream().anyMatch(item -> item.kind() == Kind.A));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId() && item.kind() == Kind.A));
      System.out.println(ITEMS.stream().anyMatch(item -> Objects.equals(item.name(), order.itemName())));
      System.out.println(ITEMS.stream().anyMatch(item -> item.score() == order.score()));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId() + 1));
      System.out.println(ITEMS.stream().anyMatch(item -> item.name().equals(item.name())));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == ITEMS.size()));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == orders.get(0).itemId()));
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == (int) order.itemId()));
      System.out.println(ITEMS.stream().filter(item -> item.id() == order.itemId()).count());
      System.out.println(ITEMS.stream().map(Item::id).anyMatch(id -> id == order.itemId()));
      System.out.println(ITEMS.stream().sorted().anyMatch(item -> item.id() == order.itemId()));
    }
  }

  void positions(List<Order> orders) {
    orders.forEach(order -> System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId())));
    for (Order order : orders) {
      Runnable later = () -> System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId()));
      later.run();
    }
    outer:
    for (Order order : orders) {
      System.out.println(ITEMS.stream().anyMatch(item -> item.id() == order.itemId()));
      continue outer;
    }
    boolean once = ITEMS.stream().anyMatch(item -> item.id() == orders.size());
  }
}
`,
    lines: [],
  },
];
