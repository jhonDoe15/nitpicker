package nitpicker.designfacts.resolve;

import com.sun.source.tree.*;
import java.util.*;
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

  public Found method(TypeInfo type, String name, int argc) {
    List<MethodInfo> candidates = new ArrayList<>();
    for (TypeInfo member : chain(type)) {
      for (MethodInfo method : member.methods) {
        if (!method.ctor && method.name.equals(name) && method.accepts(argc)) {
          candidates.add(method);
        }
      }
    }
    return select(candidates, argc);
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

  public MethodInfo onlyMethod(TypeInfo type, String name) {
    if (incomplete(type)) {
      return null;
    }
    Map<String, MethodInfo> bySignature = new LinkedHashMap<>();
    for (TypeInfo member : chain(type)) {
      for (MethodInfo method : member.methods) {
        if (!method.ctor && method.name.equals(name)) {
          bySignature.putIfAbsent(signature(method), method);
        }
      }
    }
    return bySignature.size() == 1 ? bySignature.values().iterator().next() : null;
  }

  public MethodInfo onlyConstructor(TypeInfo type) {
    List<MethodInfo> found = type.methods.stream().filter(method -> method.ctor).toList();
    return found.size() == 1 ? found.get(0) : null;
  }

  private Found select(List<MethodInfo> candidates, int argc) {
    if (candidates.isEmpty()) {
      return Found.NONE;
    }
    List<MethodInfo> exact = candidates.stream().filter(method -> method.params.size() == argc).toList();
    List<MethodInfo> pool = exact.isEmpty() ? candidates : exact;
    Map<String, MethodInfo> bySignature = new LinkedHashMap<>();
    for (MethodInfo method : pool) {
      bySignature.putIfAbsent(signature(method), method);
    }
    if (bySignature.size() == 1) {
      return new Found(pool.get(0), false);
    }
    List<MethodInfo> distinct = new ArrayList<>(bySignature.values());
    if (distinct.size() == 2 && overrides(distinct.get(0))) {
      return new Found(distinct.get(0), false);
    }
    return Found.AMBIGUOUS;
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
    List<MethodInfo> found = new ArrayList<>();
    List<TypeInfo> chain = chain(method.owner);
    for (TypeInfo member : chain.subList(1, chain.size())) {
      for (MethodInfo candidate : member.methods) {
        if (!candidate.ctor && !candidate.isStatic && candidate.name.equals(method.name)
            && candidate.params.size() == method.params.size()) {
          found.add(candidate);
        }
      }
    }
    return found;
  }
}
