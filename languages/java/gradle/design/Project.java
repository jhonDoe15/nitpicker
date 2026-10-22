package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;

final class Project {
  private static final Set<String> MARKER_SUPERS =
      Set.of("Object", "Serializable", "Cloneable", "Record", "Enum");

  final List<TypeInfo> types = new ArrayList<>();
  private final Map<String, List<TypeInfo>> byFqn = new HashMap<>();

  Project(List<Unit> units) {
    for (Unit unit : units) {
      for (Tree declaration : unit.tree.getTypeDecls()) {
        if (declaration instanceof ClassTree tree) {
          register(unit, tree, null);
        }
      }
    }
  }

  private void register(Unit unit, ClassTree tree, TypeInfo outer) {
    TypeInfo info = new TypeInfo(unit, tree, outer);
    types.add(info);
    byFqn.computeIfAbsent(info.fqn, key -> new ArrayList<>()).add(info);
    if (outer != null) {
      outer.nested.put(info.simple, info);
    }
    for (Tree member : tree.getMembers()) {
      if (member instanceof ClassTree nested) {
        register(unit, nested, info);
      }
    }
  }

  TypeInfo find(String fqn) {
    List<TypeInfo> found = byFqn.get(fqn);
    return found != null && found.size() == 1 ? found.get(0) : null;
  }

  boolean known(String fqn) {
    return byFqn.containsKey(fqn);
  }

  void link(TypeInfo type) {
    if (type.linked) {
      return;
    }
    type.linked = true;
    Tree extension = type.tree.getExtendsClause();
    if (extension != null) {
      linkSuper(type, extension, type.kind() == Tree.Kind.CLASS);
    }
    for (Tree implemented : type.tree.getImplementsClause()) {
      linkSuper(type, implemented, false);
    }
  }

  private void linkSuper(TypeInfo type, Tree tree, boolean superclass) {
    TypeInfo resolved = resolveTree(tree, type.outer, type.unit, Set.of());
    if (resolved != null) {
      type.supers.add(resolved);
      if (superclass) {
        type.superclass = resolved;
      }
      return;
    }
    String name = Names.typeText(tree);
    if (name != null && !MARKER_SUPERS.contains(name.substring(name.lastIndexOf('.') + 1))) {
      type.externalSupers.add(name);
    }
  }

  TypeInfo memberType(TypeInfo type, String name) {
    Deque<TypeInfo> queue = new ArrayDeque<>(List.of(type));
    Set<TypeInfo> seen = new HashSet<>();
    while (!queue.isEmpty()) {
      TypeInfo current = queue.poll();
      if (!seen.add(current)) {
        continue;
      }
      TypeInfo member = current.nested.get(name);
      if (member != null) {
        return member;
      }
      link(current);
      queue.addAll(current.supers);
    }
    return null;
  }

  TypeInfo resolveSimple(String name, TypeInfo owner, Unit unit, Set<String> variables) {
    if (variables.contains(name)) {
      return null;
    }
    for (TypeInfo type = owner; type != null; type = type.outer) {
      if (type.typeVars.contains(name)) {
        return null;
      }
      if (type.simple.equals(name)) {
        return type;
      }
      TypeInfo member = memberType(type, name);
      if (member != null) {
        return member;
      }
    }
    String imported = unit.single.get(name);
    if (imported != null) {
      return find(imported);
    }
    String samePackage = unit.pkg.isEmpty() ? name : unit.pkg + "." + name;
    if (known(samePackage)) {
      return find(samePackage);
    }
    return onDemand(name, unit);
  }

  private TypeInfo onDemand(String name, Unit unit) {
    Set<TypeInfo> candidates = new LinkedHashSet<>();
    for (String base : unit.onDemand) {
      TypeInfo found = find(base + "." + name);
      if (found != null) {
        candidates.add(found);
      }
    }
    return candidates.size() == 1 ? candidates.iterator().next() : null;
  }

  TypeInfo resolveQualified(List<String> parts, TypeInfo owner, Unit unit, Set<String> variables) {
    if (parts.isEmpty()) {
      return null;
    }
    TypeInfo first = resolveSimple(parts.get(0), owner, unit, variables);
    if (first != null) {
      return walk(first, parts.subList(1, parts.size()));
    }
    for (int end = 2; end <= parts.size(); end++) {
      String fqn = String.join(".", parts.subList(0, end));
      if (known(fqn)) {
        TypeInfo found = find(fqn);
        return found == null ? null : walk(found, parts.subList(end, parts.size()));
      }
    }
    return null;
  }

  private TypeInfo walk(TypeInfo start, List<String> rest) {
    TypeInfo current = start;
    for (String part : rest) {
      current = current == null ? null : memberType(current, part);
    }
    return current;
  }

  TypeInfo resolveTree(Tree tree, TypeInfo owner, Unit unit, Set<String> variables) {
    return switch (tree) {
      case null -> null;
      case IdentifierTree identifier ->
          resolveSimple(identifier.getName().toString(), owner, unit, variables);
      case MemberSelectTree select ->
          resolveQualified(Names.segments(select), owner, unit, variables);
      case ParameterizedTypeTree parameterized ->
          resolveTree(parameterized.getType(), owner, unit, variables);
      case AnnotatedTypeTree annotated ->
          resolveTree(annotated.getUnderlyingType(), owner, unit, variables);
      default -> null;
    };
  }
}
