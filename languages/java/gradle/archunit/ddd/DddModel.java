import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.domain.JavaTypeVariable;
import com.tngtech.archunit.core.domain.JavaWildcardType;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;

final class DddModel {
  private static final String TYPES = "org.jmolecules.ddd.types.";
  private static final String ANNOTATIONS = "org.jmolecules.ddd.annotation.";
  private static final String ROOT_TYPE = TYPES + "AggregateRoot";
  private static final String ENTITY_TYPE = TYPES + "Entity";
  private static final String VALUE_TYPE = TYPES + "ValueObject";
  private static final String ROOT_ANNOTATION = ANNOTATIONS + "AggregateRoot";
  private static final String ENTITY_ANNOTATION = ANNOTATIONS + "Entity";
  private static final String VALUE_ANNOTATION = ANNOTATIONS + "ValueObject";

  private final Set<JavaClass> roots = new LinkedHashSet<>();
  private final Map<JavaClass, Set<JavaClass>> entityOwners = new LinkedHashMap<>();
  private final Set<JavaClass> annotatedEntities = new LinkedHashSet<>();
  private final Set<JavaClass> values = new LinkedHashSet<>();

  DddModel(JavaClasses main) {
    for (JavaClass type : main) {
      if (type.isAnnotation()) {
        continue;
      }
      if (isRoot(type)) {
        roots.add(type);
      } else if (type.isAssignableTo(ENTITY_TYPE) && !type.getName().equals(ENTITY_TYPE)) {
        declaredOwner(type).ifPresent(owner -> entityOwners.put(type, new LinkedHashSet<>(List.of(owner))));
      } else if (type.isMetaAnnotatedWith(ENTITY_ANNOTATION)) {
        annotatedEntities.add(type);
        entityOwners.put(type, new TreeSet<>(Comparator.comparing(JavaClass::getName)));
      }
      if (type.isAssignableTo(VALUE_TYPE) || type.isMetaAnnotatedWith(VALUE_ANNOTATION)) {
        values.add(type);
      }
    }
    for (JavaClass root : roots) {
      collectHeld(root, root, new HashSet<>());
    }
    entityOwners.values().removeIf(Set::isEmpty);
  }

  Set<JavaClass> values() {
    return values;
  }

  boolean isRoot(JavaClass type) {
    return (type.isAssignableTo(ROOT_TYPE) && !type.getName().equals(ROOT_TYPE))
        || type.isMetaAnnotatedWith(ROOT_ANNOTATION);
  }

  boolean isIdentifiable(JavaClass type) {
    return isRoot(type)
        || (type.isAssignableTo(ENTITY_TYPE) && !type.getName().equals(ENTITY_TYPE))
        || type.isMetaAnnotatedWith(ENTITY_ANNOTATION);
  }

  Set<JavaClass> ownersOf(JavaClass entity) {
    return entityOwners.getOrDefault(entity, Set.of());
  }

  Map<JavaClass, Set<JavaClass>> members() {
    Map<JavaClass, Set<JavaClass>> members = new LinkedHashMap<>();
    roots.forEach(root -> members.put(root, Set.of(root)));
    members.putAll(entityOwners);
    return members;
  }

  static boolean sameAggregate(Set<JavaClass> aggregates, JavaClass root) {
    return aggregates.stream()
        .anyMatch(aggregate -> root.isAssignableTo(aggregate.getName()) || aggregate.isAssignableTo(root.getName()));
  }

  Set<JavaClass> heldTypes(JavaClass type) {
    return HeldTypes.of(type, supertype -> roots.contains(supertype)
        || entityOwners.containsKey(supertype)
        || values.contains(supertype));
  }

  private void collectHeld(JavaClass holder, JavaClass root, Set<JavaClass> visited) {
    if (!visited.add(holder)) {
      return;
    }
    for (JavaClass held : heldTypes(holder)) {
      Set<JavaClass> owners = entityOwners.get(held);
      if (owners == null) {
        continue;
      }
      if (annotatedEntities.contains(held)) {
        owners.add(root);
        collectHeld(held, root, visited);
      } else if (sameAggregate(owners, root)) {
        collectHeld(held, root, visited);
      }
    }
  }

  private static Optional<JavaClass> declaredOwner(JavaClass type) {
    return argumentOf(type, ENTITY_TYPE, Map.of(), new HashSet<>());
  }

  private static Optional<JavaClass> argumentOf(
      JavaClass type, String target, Map<String, JavaType> bindings, Set<String> visited) {
    if (!visited.add(type.getName())) {
      return Optional.empty();
    }
    List<JavaType> supertypes = new ArrayList<>(type.getInterfaces());
    type.getSuperclass().ifPresent(supertypes::add);
    for (JavaType supertype : supertypes) {
      JavaClass raw = supertype.toErasure();
      List<JavaType> arguments = new ArrayList<>();
      if (supertype instanceof JavaParameterizedType) {
        for (JavaType argument : ((JavaParameterizedType) supertype).getActualTypeArguments()) {
          arguments.add(bound(argument, bindings));
        }
      }
      if (raw.getName().equals(target)) {
        return arguments.isEmpty() || arguments.get(0) == null || arguments.get(0) instanceof JavaTypeVariable
            ? Optional.empty()
            : Optional.of(arguments.get(0).toErasure());
      }
      Map<String, JavaType> next = new HashMap<>();
      List<? extends JavaTypeVariable<?>> parameters = raw.getTypeParameters();
      for (int index = 0; index < parameters.size() && index < arguments.size(); index++) {
        if (arguments.get(index) != null) {
          next.put(parameters.get(index).getName(), arguments.get(index));
        }
      }
      Optional<JavaClass> found = argumentOf(raw, target, next, visited);
      if (found.isPresent()) {
        return found;
      }
    }
    return Optional.empty();
  }

  private static JavaType bound(JavaType argument, Map<String, JavaType> bindings) {
    if (argument instanceof JavaTypeVariable) {
      return bindings.get(((JavaTypeVariable<?>) argument).getName());
    }
    return argument instanceof JavaWildcardType ? null : argument;
  }
}
