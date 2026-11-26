package shop.recursion;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

public final class TypeResolver {
  private final Set<Object> inProgress = new HashSet<>();

  public interface Call {
    List<Object> arguments();
  }

  public String resolveCall(Call call) {
    if (!inProgress.add(call)) {
      return null;
    }
    try {
      return pick(call, shapes(call));
    } finally {
      inProgress.remove(call);
    }
  }

  public String resolveConstructor(Call created) { // violation: UnguardedRecursionEntry
    return pick(created, shapes(created));
  }

  private List<String> shapes(Call call) {
    return call.arguments().stream()
        .map(argument -> argument instanceof Call inner ? resolveCall(inner) + resolveConstructor(inner) : "")
        .toList();
  }

  private String pick(Call call, List<String> shapes) {
    return shapes.isEmpty() ? call.toString() : shapes.get(0);
  }
}
