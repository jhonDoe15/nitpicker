import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaGenericArrayType;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.domain.JavaTypeVariable;
import com.tngtech.archunit.core.domain.JavaWildcardType;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
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
  private static final int DEPTH = 8;

  private final JavaClasses project;

  UntypedTypes(JavaClasses project) {
    this.project = project;
  }

  boolean isUntyped(JavaType type, Map<String, JavaType> bindings) {
    return untyped(type, bindings, 0);
  }

  void projectTypes(JavaType type, Map<String, JavaType> bindings, BiConsumer<JavaClass, Map<String, JavaType>> sink) {
    collect(type, bindings, sink, 0);
  }

  private boolean untyped(JavaType declared, Map<String, JavaType> bindings, int depth) {
    JavaType type = resolve(declared, bindings, 0);
    if (type == null || depth > DEPTH) {
      return false;
    }
    if (type instanceof JavaGenericArrayType) {
      return untyped(((JavaGenericArrayType) type).getComponentType(), bindings, depth + 1);
    }
    JavaClass raw = type.toErasure();
    if (raw.isArray()) {
      return untyped(raw.getComponentType(), bindings, depth + 1);
    }
    if (raw.getName().equals(OBJECT) || JSON_NODES.stream().anyMatch(raw::isAssignableTo)) {
      return true;
    }
    boolean map = raw.isAssignableTo(MAP);
    if (!map && CONTAINERS.stream().noneMatch(raw::isAssignableTo)) {
      return false;
    }
    if (!(type instanceof JavaParameterizedType)) {
      return !raw.getTypeParameters().isEmpty();
    }
    List<JavaType> arguments = ((JavaParameterizedType) type).getActualTypeArguments();
    if (map) {
      return arguments.size() > MAP_VALUE && untyped(arguments.get(MAP_VALUE), bindings, depth + 1);
    }
    return arguments.stream().anyMatch(argument -> untyped(argument, bindings, depth + 1));
  }

  private JavaType resolve(JavaType type, Map<String, JavaType> bindings, int depth) {
    if (depth > DEPTH) {
      return null;
    }
    if (type instanceof JavaWildcardType) {
      List<JavaType> upper = ((JavaWildcardType) type).getUpperBounds();
      return upper.isEmpty() ? type.toErasure() : resolve(upper.get(0), bindings, depth + 1);
    }
    if (type instanceof JavaTypeVariable) {
      JavaType bound = bindings.get(((JavaTypeVariable<?>) type).getName());
      return bound == null || bound.equals(type) ? null : resolve(bound, Map.of(), depth + 1);
    }
    return type;
  }

  private void collect(
      JavaType declared, Map<String, JavaType> bindings, BiConsumer<JavaClass, Map<String, JavaType>> sink, int depth) {
    JavaType type = resolve(declared, bindings, 0);
    if (type == null || depth > DEPTH) {
      return;
    }
    if (type instanceof JavaGenericArrayType) {
      collect(((JavaGenericArrayType) type).getComponentType(), bindings, sink, depth + 1);
      return;
    }
    JavaClass raw = type.toErasure();
    if (raw.isArray()) {
      collect(raw.getBaseComponentType(), bindings, sink, depth + 1);
      return;
    }
    if (raw.getName().equals(CLASS_TOKEN) || raw.getName().startsWith(FUNCTIONS)) {
      return;
    }
    if (project.contain(raw.getName())) {
      sink.accept(raw, bindingsOf(type, raw, bindings));
    }
    if (type instanceof JavaParameterizedType) {
      ((JavaParameterizedType) type).getActualTypeArguments()
          .forEach(argument -> collect(argument, bindings, sink, depth + 1));
    }
  }

  private Map<String, JavaType> bindingsOf(JavaType type, JavaClass raw, Map<String, JavaType> outer) {
    Map<String, JavaType> bound = new HashMap<>();
    if (!(type instanceof JavaParameterizedType)) {
      return bound;
    }
    List<JavaType> arguments = ((JavaParameterizedType) type).getActualTypeArguments();
    List<? extends JavaTypeVariable<?>> parameters = raw.getTypeParameters();
    for (int index = 0; index < parameters.size() && index < arguments.size(); index++) {
      JavaType argument = resolve(arguments.get(index), outer, 0);
      if (argument != null) {
        bound.put(parameters.get(index).getName(), argument);
      }
    }
    return bound;
  }
}
