package n;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Consumer;
import java.util.function.Supplier;
import java.util.stream.Collectors;

class Differences {
  static class Node {
    @Nullable Node next;
    @Nullable String label;

    @Nullable Node next() {
      return next;
    }

    @Nullable String label() {
      return label;
    }
  }

  record Holder(Inner inner, int size) {
    record Inner(@Nullable String text, String other) {}
  }

  interface Listener<T> {
    void done(T value);
  }

  interface Action<L> {
    void run(L listener);
  }

  static class Slot<T> {
    Slot(Supplier<T> start, Supplier<T> parser) {}

    Slot<T> open() {
      return this;
    }

    Slot<T> check(Consumer<T> check) {
      return this;
    }
  }

  static void needs(String text) {}

  static void wants(Object value) {}

  static void both(Node first, Node second) {}

  static <T extends Node> T find(String name) {
    throw new IllegalStateException(name);
  }

  static @Nullable Node merged(@Nullable Node first, @Nullable Node second) {
    return first == null ? second : first;
  }

  static <T, L extends Listener<T>> void with(L listener, Action<L> action) {
    action.run(listener);
  }

  static void twoKindsOnOneExpression(Node node) {
    needs(node.next().label());
  }

  static void arrowSwitchWithoutDefault(String name, @Nullable String text) {
    switch (name) {
      case "a" -> {
        return;
      }
      case "b" -> {
        return;
      }
    }
    needs(text);
  }

  static void booleanKeyIsNotAPath(Map<Boolean, List<String>> parts) {
    List<String> kept = parts.get(false) != null ? parts.get(false) : new ArrayList<>();
    wants(kept);
  }

  static void numberAndTextKeys(Map<Integer, String> numbered, Map<String, String> named) {
    if (numbered.get(1) != null) {
      needs(numbered.get(1));
    }
    if (numbered.get(Integer.valueOf(2)) != null) {
      needs(numbered.get(2));
    }
    if (named.get("a") != null) {
      needs(named.get("a"));
    }
    needs(named.get("b"));
  }

  static void samePatternNameTwice(Object first, Object second) {
    Node other = null;
    if (first instanceof Node found) {
      other = found.next();
    }
    if (second instanceof String found) {
      both(new Node(), other);
      needs(found);
    }
  }

  static void resultOnlyItsTargetDecides(@Nullable Node given) {
    Node joined = merged(find("a"), find("b"));
    if (given == null && joined == null) {
      return;
    } else if (given == null) {
      both(new Node(), joined);
    }
  }

  static File constructorModel(Node node) {
    return new File(node.label());
  }

  static int ternaryConditionIsUnboxed(Map<String, Boolean> flags) {
    Boolean flag = flags.get("a");
    return flag ? 1 : 0;
  }

  static int comparedWithAPrimitive(Map<String, Integer> counts, List<String> names) {
    if (counts.get("a") == 0) {
      return 0;
    }
    for (String name : names) {
      if (counts.get("a") <= 0) {
        break;
      }
      needs(name);
    }
    return counts.get("a") + counts.get("b");
  }

  static void recordWithItsOwnMemberType(Holder holder) {
    needs(holder.inner().text());
    needs(holder.inner().other());
  }

  static Slot<Map<String, Object>> lambdaResultAfterReturnNull(Map<String, Object> given) {
    return new Slot<>(() -> null, () -> {
      if (given.isEmpty()) {
        return null;
      }
      Map<String, Object> map = given;
      return map;
    }).open().check(value -> {
      if (value != null) {
        wants(value.get("a"));
      }
    });
  }

  static List<String> filterThenMap(List<Node> nodes) {
    List<String> some = nodes.stream().filter(node -> node.label() != null && node.next() != null).map(node -> {
      needs(node.label());
      both(node, node.next());
      return "a";
    }).collect(Collectors.toList());
    nodes.stream().filter(node -> node.label() != null).sorted().forEach(each -> needs(each.label()));
    nodes.stream().filter(node -> {
      if (node.next() == null) {
        return false;
      }
      return node.label() != null;
    }).distinct().map(each -> each.next().label().length() + each.label().length()).collect(Collectors.toList());
    nodes.stream().filter(node -> node.label() != null).limit(2).forEach(each -> needs(each.label()));
    nodes.stream().filter(node -> node.label() != null).filter(node -> node.next() != null).forEach(each -> needs(each.label()));
    nodes.stream().filter(node -> node.label() != null || node.next() != null).forEach(each -> needs(each.label()));
    return some;
  }

  static void anonymousListener() {
    with(new Listener<Void>() {
      @Override
      public void done(Void unused) {}
    }, listener -> listener.done(null));
    with(new Listener<String>() {
      @Override
      public void done(String text) {}
    }, listener -> listener.done(null));
    Listener<Void> plain = value -> {};
    plain.done(null);
  }

  static com.google.common.base.Function<Node, String> modelledFunction() {
    com.google.common.base.Function<Node, Node> next = node -> node.next();
    wants(next);
    com.google.common.base.Function<Node, String> block = node -> {
      return node.label();
    };
    wants(block);
    return node -> node.label();
  }

  static void storedAndPassed(Node node, @Nullable String text) {
    needs(node.label = text);
  }
}
