package nitpicker.designfacts.resolve;

import com.sun.source.tree.*;
import java.util.*;
import java.util.function.Predicate;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;

public final class Lookup {
  public record Found(MethodInfo method, boolean ambiguous) {
    public static final Found NONE = new Found(null, false);
    public static final Found AMBIGUOUS = new Found(null, true);
  }

  private final Project project;

  public Lookup(Project project) {
    this.project = project;
  }

  public List<TypeInfo> chain(TypeInfo start) {
    List<TypeInfo> order = new ArrayList<>();
    Deque<TypeInfo> queue = new ArrayDeque<>(List.of(start));
    Set<TypeInfo> seen = new HashSet<>();
    while (!queue.isEmpty()) {
      TypeInfo current = queue.poll();
      if (seen.add(current)) {
        order.add(current);
        project.link(current);
        queue.addAll(current.supers);
      }
    }
    return order;
  }

  public boolean incomplete(TypeInfo type) {
    for (TypeInfo member : chain(type)) {
      if (member.hasExternalSuper()) {
        return true;
      }
    }
    return false;
  }

  public FieldInfo field(TypeInfo type, String name) {
    for (TypeInfo member : chain(type)) {
      FieldInfo found = member.field(name);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  public FieldInfo bareField(String name, TypeInfo owner) {
    for (TypeInfo type = owner; type != null; type = type.outer) {
      FieldInfo found = field(type, name);
      if (found != null) {
        return found;
      }
      if (incomplete(type)) {
        return null;
      }
    }
    return null;
  }

  private List<MethodInfo> members(TypeInfo type, Predicate<MethodInfo> keep) {
    return chain(type).stream().flatMap(member -> member.methods.stream()).filter(keep).toList();
  }

  public Found method(TypeInfo type, String name, int argc) {
    return select(members(type, method -> named(method, name) && method.accepts(argc)), argc);
  }

  private static boolean named(MethodInfo method, String name) {
    return !method.ctor && method.name.equals(name);
  }

  public Found constructor(TypeInfo type, int argc) {
    List<MethodInfo> candidates = new ArrayList<>();
    for (MethodInfo method : type.methods) {
      if (method.ctor && method.accepts(argc)) {
        candidates.add(method);
      }
    }
    return select(candidates, argc);
  }

  public record Shape(int arity, boolean unbound) {
    boolean fits(MethodInfo method) {
      if (arity < 0) {
        return true;
      }
      return method.params.size() == (unbound && !method.isStatic ? arity - 1 : arity);
    }
  }

  public MethodInfo onlyMethod(TypeInfo type, String name, Shape shape) {
    if (incomplete(type)) {
      return null;
    }
    Map<String, MethodInfo> bySignature = new LinkedHashMap<>();
    for (MethodInfo method : members(type, method -> named(method, name) && shape.fits(method))) {
      bySignature.putIfAbsent(signature(method), method);
    }
    return bySignature.size() == 1 ? bySignature.values().iterator().next() : null;
  }

  public MethodInfo onlyConstructor(TypeInfo type, int arity) {
    List<MethodInfo> found =
        type.methods.stream()
            .filter(method -> method.ctor && (arity < 0 || method.params.size() == arity))
            .toList();
    return found.size() == 1 ? found.get(0) : null;
  }

  private Found select(List<MethodInfo> candidates, int argc) {
    if (candidates.isEmpty()) {
      return Found.NONE;
    }
    List<MethodInfo> exact =
        candidates.stream().filter(method -> method.params.size() == argc).toList();
    Map<String, MethodInfo> bySignature = new LinkedHashMap<>();
    for (MethodInfo method : exact.isEmpty() ? candidates : exact) {
      bySignature.putIfAbsent(signature(method), method);
    }
    List<MethodInfo> distinct = new ArrayList<>(bySignature.values());
    if (distinct.size() == 1) {
      return new Found(distinct.get(0), false);
    }
    MethodInfo overriding = distinct.size() == 2 ? overridingOf(distinct) : null;
    return overriding == null ? Found.AMBIGUOUS : new Found(overriding, false);
  }

  private MethodInfo overridingOf(List<MethodInfo> pair) {
    for (int index = 0; index < 2; index++) {
      MethodInfo method = pair.get(index);
      MethodInfo other = pair.get(1 - index);
      if (overrides(method) && supertypesOf(method.owner).contains(other.owner)) {
        return method;
      }
    }
    return null;
  }

  private List<TypeInfo> supertypesOf(TypeInfo type) {
    List<TypeInfo> chain = chain(type);
    return chain.subList(1, chain.size());
  }

  private static boolean overrides(MethodInfo method) {
    return method.tree != null && Names.hasAnnotation(method.tree.getModifiers(), "Override");
  }

  public static String signature(MethodInfo method) {
    StringBuilder text = new StringBuilder();
    for (ParamInfo param : method.params) {
      text.append(Names.typeText(param.type)).append(',');
    }
    return text.toString();
  }

  public List<MethodInfo> overridden(MethodInfo method) {
    return supertypesOf(method.owner).stream()
        .flatMap(member -> member.methods.stream())
        .filter(candidate -> sameShape(candidate, method))
        .toList();
  }

  private static boolean sameShape(MethodInfo candidate, MethodInfo method) {
    return named(candidate, method.name)
        && !candidate.isStatic
        && candidate.params.size() == method.params.size()
        && candidate.matchesParams(method);
  }
}
