import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaEnumConstant;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.domain.JavaParameterizedType;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.domain.JavaWildcardType;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

final class Lifetimes {
  static final String SCOPE_CAPTURE = "spring-scope-capture";
  private static final String COMPONENT = "org.springframework.stereotype.Component";
  private static final String BEAN = "org.springframework.context.annotation.Bean";
  private static final String COMPONENT_SCAN = "org.springframework.context.annotation.ComponentScan";
  private static final String LAZY = "org.springframework.context.annotation.Lazy";
  private static final List<String> INJECTION_MARKERS =
      List.of(
          "org.springframework.beans.factory.annotation.Autowired",
          "jakarta.inject.Inject",
          "javax.inject.Inject",
          "jakarta.annotation.Resource",
          "javax.annotation.Resource");
  private static final Set<String> PROVIDERS =
      Set.of(
          "org.springframework.beans.factory.ObjectProvider",
          "org.springframework.beans.factory.ObjectFactory",
          "jakarta.inject.Provider",
          "javax.inject.Provider");
  private static final Set<String> CONTAINERS = Set.of("java.util.Optional", "java.util.Collection", "java.util.Map");

  private static final class Bean {
    final JavaClass type;
    final BeanScope scope;

    Bean(JavaClass type, BeanScope scope) {
      this.type = type;
      this.scope = scope;
    }
  }

  private Lifetimes() {}

  static void check(JavaClasses main, Set<Found> sink) {
    String scanProxy = componentScanProxy(main);
    List<Bean> beans = new ArrayList<>();
    for (JavaClass type : main) {
      if (isComponent(type)) {
        beans.add(new Bean(type, BeanScope.of(type.getAnnotations(), scanProxy)));
      }
      for (JavaMethod method : type.getMethods()) {
        if (method.isMetaAnnotatedWith(BEAN)) {
          beans.add(new Bean(method.getRawReturnType(), BeanScope.of(method.getAnnotations(), "NO")));
        }
      }
    }
    for (JavaClass type : main) {
      if (isComponent(type) && BeanScope.of(type.getAnnotations(), scanProxy).isSingleton()) {
        componentInjections(type).forEach(injected -> report(type, injected, beans, sink));
      }
      for (JavaMethod method : type.getMethods()) {
        if (method.isMetaAnnotatedWith(BEAN) && BeanScope.of(method.getAnnotations(), "NO").isSingleton()) {
          injectedParameters(method).forEach(injected -> report(type, injected, beans, sink));
        }
      }
    }
  }

  private static boolean isComponent(JavaClass type) {
    return type.isMetaAnnotatedWith(COMPONENT)
        && !type.isInterface()
        && !type.isAnnotation()
        && !type.getModifiers().contains(JavaModifier.ABSTRACT);
  }

  private static String componentScanProxy(JavaClasses main) {
    Set<String> modes =
        main.stream()
            .flatMap(type -> type.getAnnotations().stream())
            .filter(annotation -> annotation.getRawType().getName().equals(COMPONENT_SCAN))
            .map(annotation -> annotation.get("scopedProxy"))
            .map(mode -> mode.filter(JavaEnumConstant.class::isInstance).map(value -> ((JavaEnumConstant) value).name()))
            .map(mode -> mode.orElse("DEFAULT"))
            .filter(mode -> !mode.equals("DEFAULT"))
            .collect(Collectors.toSet());
    return modes.isEmpty() ? "NO" : modes.size() == 1 ? modes.iterator().next() : "DEFAULT";
  }

  private static List<JavaType> componentInjections(JavaClass type) {
    List<JavaType> injected = new ArrayList<>();
    type.getConstructors().forEach(constructor -> injected.addAll(injectedParameters(constructor)));
    for (JavaField field : type.getFields()) {
      if (isInjectionPoint(field.getAnnotations()) && !field.isMetaAnnotatedWith(LAZY)) {
        injected.add(field.getType());
      }
    }
    for (JavaMethod method : type.getMethods()) {
      if (isInjectionPoint(method.getAnnotations())) {
        injected.addAll(injectedParameters(method));
      }
    }
    return injected;
  }

  private static boolean isInjectionPoint(Set<? extends JavaAnnotation<?>> annotations) {
    return annotations.stream()
        .anyMatch(annotation -> INJECTION_MARKERS.contains(annotation.getRawType().getName()));
  }

  private static List<JavaType> injectedParameters(JavaCodeUnit codeUnit) {
    if (codeUnit.isMetaAnnotatedWith(LAZY)) {
      return List.of();
    }
    return codeUnit.getParameters().stream()
        .filter(parameter -> !parameter.isMetaAnnotatedWith(LAZY))
        .map(JavaParameter::getType)
        .collect(Collectors.toList());
  }

  private static void report(JavaClass consumer, JavaType injected, List<Bean> beans, Set<Found> sink) {
    for (JavaClass wanted : capturedTypes(injected)) {
      List<Bean> candidates =
          beans.stream().filter(bean -> bean.type.isAssignableTo(wanted.getName())).collect(Collectors.toList());
      boolean captured =
          !candidates.isEmpty()
              && candidates.stream().allMatch(bean -> bean.scope.lifetime == BeanScope.Lifetime.SHORT);
      if (captured && !candidates.get(0).type.equals(consumer)) {
        Bean bean = candidates.get(0);
        Found.add(sink, SCOPE_CAPTURE, consumer, bean.scope.name + ":" + bean.type.getName());
      }
    }
  }

  private static List<JavaClass> capturedTypes(JavaType type) {
    JavaClass raw = type.toErasure();
    if (PROVIDERS.contains(raw.getName())) {
      return List.of();
    }
    if (raw.isArray()) {
      return capturedTypes(raw.getBaseComponentType());
    }
    Optional<String> container = CONTAINERS.stream().filter(raw::isAssignableTo).findFirst();
    if (container.isEmpty()) {
      return List.of(raw);
    }
    if (!(type instanceof JavaParameterizedType)) {
      return List.of();
    }
    List<JavaType> arguments = ((JavaParameterizedType) type).getActualTypeArguments();
    return arguments.isEmpty() ? List.of() : capturedTypes(unwildcard(arguments.get(arguments.size() - 1)));
  }

  private static JavaType unwildcard(JavaType type) {
    if (type instanceof JavaWildcardType) {
      List<JavaType> bounds = ((JavaWildcardType) type).getUpperBounds();
      return bounds.isEmpty() ? type : bounds.get(0);
    }
    return type;
  }
}
