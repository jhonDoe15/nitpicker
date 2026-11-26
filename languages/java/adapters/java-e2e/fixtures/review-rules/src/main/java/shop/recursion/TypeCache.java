package shop.recursion;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class TypeCache {
  private final Map<Object, String> cache = new HashMap<>();
  private final Set<Object> inProgress = new HashSet<>();

  public interface Node {
    List<Node> children();
  }

  public String typeOf(Node node) {
    String known = cache.get(node);
    if (known != null) {
      return known;
    }
    if (!inProgress.add(node)) {
      return "unknown";
    }
    try {
      String found = combine(node);
      cache.put(node, found); // violation: CacheAfterGuardFallback
      return found;
    } finally {
      inProgress.remove(node);
    }
  }

  public String flatTypeOf(Node node) {
    if (!inProgress.add(node)) {
      return "unknown";
    }
    String found = String.valueOf(node.children().size());
    cache.put(node, found);
    inProgress.remove(node);
    return found;
  }

  private String combine(Node node) {
    StringBuilder text = new StringBuilder();
    for (Node child : node.children()) {
      text.append(typeOf(child));
    }
    return text.toString();
  }
}
