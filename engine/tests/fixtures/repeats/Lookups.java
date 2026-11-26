package repeats;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

public class Lookups {
  record Item(String name, int size) {}

  Optional<Item> resolve(String key) {
    return Optional.empty();
  }

  Item find(String key, int depth) {
    return null;
  }

  int fib(int n) {
    return n < 2 ? n : fib(n - 1) + fib(n - 2);
  }

  int twice(int n) {
    return n == 0 ? 0 : twice(n - 1) + twice(n - 1);
  }

  int arms(int n, boolean up) {
    return switch (n) {
      case 0 -> arms(n - 1, true);
      case 1 -> arms(n - 1, false);
      default -> up ? arms(n - 2, up) : arms(n - 2, up);
    };
  }

  int overloaded(int n) {
    return overloaded(n, true) + overloaded(n, true);
  }

  int overloaded(int n, boolean up) {
    return up ? n : -n;
  }

  int branches(int n) {
    if (n > 3) {
      return branches(n - 1);
    }
    return n == 0 ? 0 : branches(n - 1);
  }

  void reflective(List<Object> targets) throws Exception {
    for (Object target : targets) {
      Method method = Item.class.getMethod("name");
      Field field = Item.class.getDeclaredField("size");
      Class<?> type = Class.forName("java.lang.String");
      Method own = target.getClass().getMethod("toString");
      String name = target.toString();
      Class<?> named = Class.forName(name);
      System.out.println(method.invoke(target) + " " + field + type + own + named);
    }
    targets.forEach(target -> {
      try {
        System.out.println(Item.class.getMethod("size", int.class).invoke(target));
      } catch (Exception problem) {
        throw new IllegalStateException(problem);
      }
    });
    Method once = Item.class.getMethod("name");
    System.out.println(once);
  }

  void climb(Node start) {
    Node level = start;
    while (level != null) {
      if (level instanceof Element element) {
        NodeList found = element.getElementsByTagName("title");
        System.out.println(found.getLength());
      }
      level = level.getParentNode();
    }
    for (Element at = (Element) start; at != null; at = (Element) at.getParentNode()) {
      System.out.println(at.getElementsByTagName("title").getLength());
    }
    Node current = start;
    while (current != null) {
      System.out.println(current.getNodeName());
      current = current.getParentNode();
    }
  }

  void repeatedCalls(String key, List<String> keys) {
    if (resolve(key).isPresent()) {
      System.out.println(resolve(key).get());
    }
    if (find(key, 2) != null) {
      System.out.println(find(key, 2).name());
    }
    String name = find(key, 1) == null ? "none" : find(key, 1).name();
    boolean big = resolve(key).isPresent() && resolve(key).get().size() > 3;
    if (find(key, 2) != null) {
      System.out.println(find(key, 3).name());
    }
    if (resolve(key.trim()).isPresent()) {
      System.out.println(resolve(key.trim()).get());
    }
    Optional<Item> kept = resolve(key);
    if (kept.isPresent()) {
      System.out.println(kept.get() + name + big);
    }
  }

  void earlyExits(List<String> keys, List<Item> items) {
    for (String key : keys) {
      Item found = find(key, 4);
      if (key.length() > 3) {
        continue;
      }
      System.out.println(found);
    }
    for (Item item : items) {
      Item same = find(item.name(), 4);
      if (item.size() > 3) {
        continue;
      }
      System.out.println(same);
    }
    for (String key : keys) {
      Item used = find(key, 4);
      if (used == null) {
        continue;
      }
      System.out.println(used);
    }
    for (String key : keys) {
      List<String> names = new ArrayList<>(keys);
      if (key.isEmpty()) {
        break;
      }
      System.out.println(names);
    }
  }

  Item exitFirst(String key, boolean skip) {
    Item found = find(key, 5);
    if (skip) {
      return null;
    }
    return found;
  }

  List<String> namesFirst(List<Item> items, boolean skip) {
    List<String> names = items.stream().map(Item::name).toList();
    if (skip) {
      return List.of();
    }
    return names;
  }

  List<Item> copyFirst(List<Item> items, boolean skip) {
    List<Item> copy = new ArrayList<>(items);
    if (skip) {
      return List.of();
    }
    return copy;
  }

  List<Item> sizedFirst(boolean skip) {
    List<Item> sized = new ArrayList<>(16);
    if (skip) {
      return List.of();
    }
    return sized;
  }

  void checkedFirst(List<String> keys) {
    for (String key : keys) {
      Item found = checkFound(key, 1);
      if (key.isEmpty()) {
        continue;
      }
      Item kind = getKind(key, 1);
      if (key.isBlank()) {
        continue;
      }
      System.out.println(found + " " + kind);
    }
  }

  Item checkFound(String key, int depth) {
    return find(key, depth);
  }

  Item getKind(String key, int depth) {
    return find(key, depth);
  }

  Item exitWithElse(String key, boolean skip) {
    Item found = find(key, 5);
    if (skip) {
      return null;
    } else {
      System.out.println(key);
    }
    return found;
  }
}
