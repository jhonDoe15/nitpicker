import com.tngtech.archunit.core.domain.JavaClass;
import java.util.Arrays;
import java.util.List;

final class Spring {
  static final String ENTITY = "jakarta.persistence.Entity";
  static final String LEGACY_ENTITY = "javax.persistence.Entity";
  private static final String CONTROLLER = "org.springframework.stereotype.Controller";
  private static final String ADVICE = "org.springframework.web.bind.annotation.ControllerAdvice";
  private static final String SERVICE = "org.springframework.stereotype.Service";
  private static final String REPOSITORY = "org.springframework.stereotype.Repository";
  private static final String DATA_REPOSITORY = "org.springframework.data.repository.Repository";
  private static final List<String> WEB_PACKAGES =
      Arrays.asList(
          "jakarta.servlet.",
          "javax.servlet.",
          "org.springframework.web.bind.",
          "org.springframework.web.servlet.",
          "org.springframework.web.multipart.");
  private static final String RESPONSE_ENTITY = "org.springframework.http.ResponseEntity";

  private Spring() {}

  static JavaClass owner(JavaClass type) {
    JavaClass current = type;
    while (current.getEnclosingClass().isPresent()) {
      current = current.getEnclosingClass().get();
    }
    return current;
  }

  static boolean isController(JavaClass type) {
    return type.isMetaAnnotatedWith(CONTROLLER);
  }

  static boolean isService(JavaClass type) {
    return type.isMetaAnnotatedWith(SERVICE);
  }

  static boolean isRepository(JavaClass type) {
    return type.isMetaAnnotatedWith(REPOSITORY) || type.isAssignableTo(DATA_REPOSITORY);
  }

  static boolean isEntity(JavaClass type) {
    return type.isAnnotatedWith(ENTITY) || type.isAnnotatedWith(LEGACY_ENTITY);
  }

  static boolean isWebLayer(JavaClass type) {
    String name = type.getName();
    return isController(type)
        || type.isMetaAnnotatedWith(ADVICE)
        || name.equals(RESPONSE_ENTITY)
        || WEB_PACKAGES.stream().anyMatch(name::startsWith);
  }

  static boolean isGenerated(JavaClass type) {
    String simple = type.getSimpleName();
    return simple.equals("package-info") || simple.equals("module-info");
  }
}
