import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaGenericArrayType;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.domain.JavaTypeVariable;
import com.tngtech.archunit.core.domain.JavaWildcardType;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;

final class HeldTypes {
  private static final String ASSOCIATION_TYPE = "org.jmolecules.ddd.types.Association";
  private static final String ASSOCIATION_ANNOTATION = "org.jmolecules.ddd.annotation.Association";
  private static final String CLASS_TOKEN = "java.lang.Class";
  private static final String FUNCTIONS = "java.util.function.";

  private HeldTypes() {}

  static Set<JavaClass> of(JavaClass type, Predicate<JavaClass> checkedOnItsOwn) {
    Set<JavaClass> held = new LinkedHashSet<>();
    Map<String, JavaType> bindings = new HashMap<>();
    Set<String> visited = new HashSet<>();
    JavaClass current = type;
    while (visited.add(current.getName()) && (current.equals(type) || !checkedOnItsOwn.test(current))) {
      for (JavaField field : current.getFields()) {
        if (counts(field)) {
          collect(field.getType(), bindings, held, new HashSet<>());
        }
      }
      Optional<JavaType> superclass = current.getSuperclass();
      if (superclass.isEmpty()) {
        break;
      }
      bindings = bindingsOf(superclass.get(), bindings);
      current = superclass.get().toErasure();
    }
    return held;
  }

  private static boolean counts(JavaField field) {
    Set<JavaModifier> modifiers = field.getModifiers();
    return !modifiers.contains(JavaModifier.STATIC)
        && !modifiers.contains(JavaModifier.SYNTHETIC)
        && !field.isMetaAnnotatedWith(ASSOCIATION_ANNOTATION);
  }

  private static Map<String, JavaType> bindingsOf(JavaType supertype, Map<String, JavaType> outer) {
    Map<String, JavaType> next = new HashMap<>();
    if (!(supertype instanceof JavaParameterizedType)) {
      return next;
    }
    List<JavaType> arguments = ((JavaParameterizedType) supertype).getActualTypeArguments();
    List<? extends JavaTypeVariable<?>> parameters = supertype.toErasure().getTypeParameters();
    for (int index = 0; index < parameters.size() && index < arguments.size(); index++) {
      JavaType argument = arguments.get(index);
      if (argument instanceof JavaTypeVariable && outer.containsKey(((JavaTypeVariable<?>) argument).getName())) {
        argument = outer.get(((JavaTypeVariable<?>) argument).getName());
      }
      next.put(parameters.get(index).getName(), argument);
    }
    return next;
  }

  private static void collect(JavaType type, Map<String, JavaType> bindings, Set<JavaClass> sink, Set<String> seen) {
    if (type instanceof JavaWildcardType) {
      ((JavaWildcardType) type).getUpperBounds().forEach(bound -> collect(bound, bindings, sink, seen));
      ((JavaWildcardType) type).getLowerBounds().forEach(bound -> collect(bound, bindings, sink, seen));
      return;
    }
    if (type instanceof JavaTypeVariable) {
      JavaTypeVariable<?> variable = (JavaTypeVariable<?>) type;
      if (seen.add(variable.getName())) {
        JavaType bound = bindings.get(variable.getName());
        if (bound != null && !bound.equals(type)) {
          collect(bound, bindings, sink, seen);
        } else {
          variable.getUpperBounds().forEach(upper -> collect(upper, bindings, sink, seen));
        }
      }
      return;
    }
    if (type instanceof JavaGenericArrayType) {
      collect(((JavaGenericArrayType) type).getComponentType(), bindings, sink, seen);
      return;
    }
    JavaClass raw = type.toErasure();
    if (raw.isArray()) {
      collect(raw.getBaseComponentType(), bindings, sink, seen);
      return;
    }
    if (raw.isAssignableTo(ASSOCIATION_TYPE)) {
      return;
    }
    sink.add(raw);
    boolean opaque = raw.getName().equals(CLASS_TOKEN) || raw.getName().startsWith(FUNCTIONS);
    if (type instanceof JavaParameterizedType && !opaque) {
      ((JavaParameterizedType) type).getActualTypeArguments()
          .forEach(argument -> collect(argument, bindings, sink, seen));
    }
  }
}
