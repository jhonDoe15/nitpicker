import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

final class Layout {
  static final String LAYOUT = "spring-layout";
  static final String FEATURE_BOUNDARY = "spring-feature-boundary";
  static final String SHARED_PURE = "spring-shared-pure";
  private static final String APPLICATION = "org.springframework.boot.autoconfigure.SpringBootApplication";
  private static final String CONFIGURATION = "org.springframework.context.annotation.Configuration";
  private static final String PROPERTIES = "org.springframework.boot.context.properties.ConfigurationProperties";
  private static final String SERVLET_INITIALIZER =
      "org.springframework.boot.web.servlet.support.SpringBootServletInitializer";
  private static final String COMPONENT = "org.springframework.stereotype.Component";
  private static final String SHARED = "shared";
  private static final Set<String> LAYER_PACKAGES =
      Set.of(
          "controller", "controllers", "service", "services", "repository", "repositories",
          "entity", "entities", "model", "models", "dto", "dtos", "dao", "util", "utils", "common");

  private Layout() {}

  static String rootPackage(JavaClasses main) {
    List<String> common = null;
    for (JavaClass type : main) {
      if (type.isAnnotatedWith(APPLICATION)) {
        List<String> segments = Arrays.asList(type.getPackageName().split("\\."));
        common = common == null ? segments : commonPrefix(common, segments);
      }
    }
    return common == null || common.isEmpty() || common.get(0).isEmpty() ? null : String.join(".", common);
  }

  private static List<String> commonPrefix(List<String> left, List<String> right) {
    int length = 0;
    while (length < left.size() && length < right.size() && left.get(length).equals(right.get(length))) {
      length++;
    }
    return left.subList(0, length);
  }

  static void check(JavaClasses main, String root, Set<Found> sink) {
    for (JavaClass type : main) {
      String[] path = relativePath(type, root);
      if (path == null || Spring.isGenerated(type)) {
        continue;
      }
      if (path.length == 0) {
        rootClass(type, main, sink);
      } else if (LAYER_PACKAGES.contains(path[0])) {
        Found.add(sink, LAYOUT, type, path[0]);
      }
      if (path.length > 0 && path[0].equals(SHARED)) {
        sharedClass(type, root, sink);
      } else if (path.length > 0 && !LAYER_PACKAGES.contains(path[0])) {
        featureClass(type, path[0], root, sink);
      }
    }
  }

  private static boolean isFeature(String name) {
    return !name.equals(SHARED) && !LAYER_PACKAGES.contains(name);
  }

  private static String[] relativePath(JavaClass type, String root) {
    String packageName = type.getPackageName();
    if (packageName.equals(root)) {
      return new String[0];
    }
    return packageName.startsWith(root + ".")
        ? packageName.substring(root.length() + 1).split("\\.")
        : null;
  }

  private static void rootClass(JavaClass type, JavaClasses main, Set<Found> sink) {
    JavaClass owner = Spring.owner(type);
    if (!allowedAtRoot(owner) && !(Spring.isFileFacade(owner) && sharesFileWithAllowed(owner, main))) {
      Found.add(sink, LAYOUT, type, "");
    }
  }

  private static boolean allowedAtRoot(JavaClass owner) {
    return owner.isMetaAnnotatedWith(CONFIGURATION)
        || owner.isAnnotatedWith(PROPERTIES)
        || owner.isAssignableTo(SERVLET_INITIALIZER);
  }

  private static boolean sharesFileWithAllowed(JavaClass facade, JavaClasses main) {
    String file = Spring.sourceFile(facade);
    return !file.isEmpty()
        && main.stream()
            .anyMatch(
                other -> other != facade
                    && other.getPackageName().equals(facade.getPackageName())
                    && Spring.sourceFile(other).equals(file)
                    && allowedAtRoot(Spring.owner(other)));
  }

  private static void featureClass(JavaClass type, String feature, String root, Set<Found> sink) {
    for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
      String[] target = relativePath(dependency.getTargetClass(), root);
      if (target != null && target.length > 1 && isFeature(target[0]) && !target[0].equals(feature)) {
        Found.add(sink, FEATURE_BOUNDARY, type, dependency.getTargetClass().getName());
      }
    }
  }

  private static void sharedClass(JavaClass type, String root, Set<Found> sink) {
    if (type.isMetaAnnotatedWith(COMPONENT) || Spring.isEntity(type)) {
      Found.add(sink, SHARED_PURE, type, "");
    }
    for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
      String[] target = relativePath(dependency.getTargetClass(), root);
      if (target != null && target.length > 0 && isFeature(target[0])) {
        Found.add(sink, SHARED_PURE, type, dependency.getTargetClass().getName());
      }
    }
  }
}
