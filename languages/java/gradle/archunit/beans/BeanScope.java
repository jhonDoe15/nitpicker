import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaEnumConstant;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

final class BeanScope {
  enum Lifetime { CONTAINER, SHORT, SHORT_PROXIED, UNKNOWN }

  static final BeanScope SINGLETON = new BeanScope("singleton", Lifetime.CONTAINER);
  private static final String SCOPE = "org.springframework.context.annotation.Scope";
  private static final Set<String> CONTAINER_SCOPES = Set.of("", "singleton", "application");
  private static final Set<String> SHORT_SCOPES = Set.of("request", "session", "websocket", "step", "job");
  private static final Set<String> PROXIES = Set.of("TARGET_CLASS", "INTERFACES");
  private static final String UNRESOLVED_PROXY = "DEFAULT";

  final String name;
  final Lifetime lifetime;

  private BeanScope(String name, Lifetime lifetime) {
    this.name = name;
    this.lifetime = lifetime;
  }

  static BeanScope of(Set<? extends JavaAnnotation<?>> annotations, String defaultProxy) {
    return find(annotations, defaultProxy, new HashSet<>()).orElse(SINGLETON);
  }

  boolean isSingleton() {
    return lifetime == Lifetime.CONTAINER && !name.equals("prototype");
  }

  private static Optional<BeanScope> find(
      Set<? extends JavaAnnotation<?>> annotations, String defaultProxy, Set<String> visited) {
    for (JavaAnnotation<?> annotation : annotations) {
      JavaClass type = annotation.getRawType();
      if (type.getName().equals(SCOPE)) {
        return Optional.of(resolve(scopeName(annotation), proxyMode(annotation, defaultProxy)));
      }
      if (!visited.add(type.getName())) {
        continue;
      }
      Optional<BeanScope> meta = find(type.getAnnotations(), defaultProxy, visited);
      if (meta.isPresent()) {
        return annotation.get("proxyMode").isPresent()
            ? Optional.of(resolve(meta.get().name, proxyMode(annotation, defaultProxy)))
            : meta;
      }
    }
    return Optional.empty();
  }

  private static String scopeName(JavaAnnotation<?> annotation) {
    String value = (String) annotation.get("value").orElse("");
    return value.isEmpty() ? (String) annotation.get("scopeName").orElse("") : value;
  }

  static String enumName(Optional<Object> value) {
    return value
        .filter(JavaEnumConstant.class::isInstance)
        .map(constant -> ((JavaEnumConstant) constant).name())
        .orElse(UNRESOLVED_PROXY);
  }

  private static String proxyMode(JavaAnnotation<?> annotation, String defaultProxy) {
    String mode = enumName(annotation.get("proxyMode"));
    return mode.equals(UNRESOLVED_PROXY) ? defaultProxy : mode;
  }

  private static BeanScope resolve(String name, String proxyMode) {
    if (CONTAINER_SCOPES.contains(name) || name.equals("prototype")) {
      return new BeanScope(name.isEmpty() ? "singleton" : name, Lifetime.CONTAINER);
    }
    if (!SHORT_SCOPES.contains(name) || proxyMode.equals(UNRESOLVED_PROXY)) {
      return new BeanScope(name, Lifetime.UNKNOWN);
    }
    return new BeanScope(name, PROXIES.contains(proxyMode) ? Lifetime.SHORT_PROXIED : Lifetime.SHORT);
  }
}
