import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaGenericArrayType;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.domain.JavaTypeVariable;
import com.tngtech.archunit.core.domain.JavaWildcardType;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.BiConsumer;

final class UntypedTypes {
  private static final String OBJECT = "java.lang.Object";
  private static final String MAP = "java.util.Map";
  private static final List<String> JSON_NODES =
      List.of("com.fasterxml.jackson.databind.JsonNode", "tools.jackson.databind.JsonNode");
  private static final List<String> CONTAINERS =
      List.of("java.lang.Iterable", "java.util.Optional", "java.util.stream.Stream");
  private static final String CLASS_TOKEN = "java.lang.Class";
  private static final String FUNCTIONS = "java.util.function.";
  private static final int MAP_VALUE = 1;
  private static final int DEPTH = 32;

  private final JavaClasses project;

  UntypedTypes(JavaClasses project) {
    this.project = project;
  }

  static final class Bound {
    private final JavaType type;
    private final Map<String, Bound> scope;

    private Bound(JavaType type, Map<String, Bound> scope) {
      this.type = type;
      this.scope = scope;
    }

    private String describe(int depth) {
      return depth > DEPTH ? "" : type.getName() + UntypedTypes.describe(scope, depth + 1);
    }
  }

  boolean isUntyped(JavaType type, Map<String, Bound> scope) {
    return untyped(type, scope, 0);
  }

  void projectTypes(JavaType type, Map<String, Bound> scope, BiConsumer<JavaClass, Map<String, Bound>> sink) {
    collect(type, scope, sink, 0);
  }

  Map<String, Bound> supertypeScope(JavaType supertype, Map<String, Bound> scope) {
    return bindingsOf(supertype, supertype.toErasure(), scope);
  }

  static String describe(Map<String, Bound> scope, int depth) {
    Map<String, String> names = new TreeMap<>();
    scope.forEach((name, bound) -> names.put(name, bound.describe(depth)));
    return names.toString();
  }

  private boolean untyped(JavaType declared, Map<String, Bound> outer, int depth) {
    Bound resolved = resolve(declared, outer, 0);
    if (resolved == null || depth > DEPTH) {
      return false;
    }
    JavaType type = resolved.type;
    Map<String, Bound> scope = resolved.scope;
    if (type instanceof JavaGenericArrayType) {
      return untyped(((JavaGenericArrayType) type).getComponentType(), scope, depth + 1);
    }
    JavaClass raw = type.toErasure();
    if (raw.isArray()) {
      return untyped(raw.getComponentType(), scope, depth + 1);
    }
    if (raw.getName().equals(OBJECT) || JSON_NODES.stream().anyMatch(raw::isAssignableTo)) {
      return true;
    }
    boolean map = raw.isAssignableTo(MAP);
    if (!map && CONTAINERS.stream().noneMatch(raw::isAssignableTo)) {
      return false;
    }
    if (!(type instanceof JavaParameterizedType)) {
      return !raw.getTypeParameters().isEmpty() || (project.contain(raw.getName()) && untypedSupertype(raw, depth));
    }
    List<JavaType> arguments = ((JavaParameterizedType) type).getActualTypeArguments();
    if (map) {
      return arguments.size() > MAP_VALUE && untyped(arguments.get(MAP_VALUE), scope, depth + 1);
    }
    return arguments.stream().anyMatch(argument -> untyped(argument, scope, depth + 1));
  }

  private boolean untypedSupertype(JavaClass raw, int depth) {
    List<JavaType> supertypes = new ArrayList<>(raw.getInterfaces());
    raw.getSuperclass().ifPresent(supertypes::add);
    return supertypes.stream().anyMatch(supertype -> untyped(supertype, Map.of(), depth + 1));
  }

  private static Bound resolve(JavaType type, Map<String, Bound> scope, int depth) {
    if (depth > DEPTH) {
      return null;
    }
    if (type instanceof JavaWildcardType) {
      JavaWildcardType wildcard = (JavaWildcardType) type;
      if (!wildcard.getLowerBounds().isEmpty()) {
        return resolve(wildcard.getLowerBounds().get(0), scope, depth + 1);
      }
      List<JavaType> upper = wildcard.getUpperBounds();
      return upper.isEmpty() ? new Bound(type.toErasure(), Map.of()) : resolve(upper.get(0), scope, depth + 1);
    }
    if (type instanceof JavaTypeVariable) {
      Bound bound = scope.get(((JavaTypeVariable<?>) type).getName());
      return bound == null || bound.type.equals(type) ? null : resolve(bound.type, bound.scope, depth + 1);
    }
    return new Bound(type, scope);
  }

  private void collect(
      JavaType declared, Map<String, Bound> outer, BiConsumer<JavaClass, Map<String, Bound>> sink, int depth) {
    Bound resolved = resolve(declared, outer, 0);
    if (resolved == null || depth > DEPTH) {
      return;
    }
    JavaType type = resolved.type;
    Map<String, Bound> scope = resolved.scope;
    if (type instanceof JavaGenericArrayType) {
      collect(((JavaGenericArrayType) type).getComponentType(), scope, sink, depth + 1);
      return;
    }
    JavaClass raw = type.toErasure();
    if (raw.isArray()) {
      collect(raw.getBaseComponentType(), scope, sink, depth + 1);
      return;
    }
    if (raw.getName().equals(CLASS_TOKEN) || raw.getName().startsWith(FUNCTIONS)) {
      return;
    }
    if (project.contain(raw.getName())) {
      sink.accept(raw, bindingsOf(type, raw, scope));
    }
    if (type instanceof JavaParameterizedType) {
      ((JavaParameterizedType) type).getActualTypeArguments()
          .forEach(argument -> collect(argument, scope, sink, depth + 1));
    }
  }

  private static Map<String, Bound> bindingsOf(JavaType type, JavaClass raw, Map<String, Bound> scope) {
    Map<String, Bound> bound = new HashMap<>();
    if (!(type instanceof JavaParameterizedType)) {
      return bound;
    }
    List<JavaType> arguments = ((JavaParameterizedType) type).getActualTypeArguments();
    List<? extends JavaTypeVariable<?>> parameters = raw.getTypeParameters();
    for (int index = 0; index < parameters.size() && index < arguments.size(); index++) {
      JavaType argument = arguments.get(index);
      List<JavaType> declared = parameters.get(index).getUpperBounds();
      boolean open = isOpen(argument) && !declared.isEmpty() && !declared.get(0).getName().equals(OBJECT);
      Bound value = open ? new Bound(declared.get(0), Map.of()) : new Bound(argument, scope);
      bound.put(parameters.get(index).getName(), value);
    }
    return bound;
  }

  private static boolean isOpen(JavaType argument) {
    if (!(argument instanceof JavaWildcardType)) {
      return false;
    }
    JavaWildcardType wildcard = (JavaWildcardType) argument;
    List<JavaType> upper = wildcard.getUpperBounds();
    return wildcard.getLowerBounds().isEmpty() && (upper.isEmpty() || upper.get(0).getName().equals(OBJECT));
  }
}
