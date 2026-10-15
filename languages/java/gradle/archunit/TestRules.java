import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

final class TestRules {
  static final String PLACEMENT = "spring-test-placement";
  static final String DIRTIES_CONTEXT = "spring-no-dirties-context";
  private static final String DIRTIES = "org.springframework.test.annotation.DirtiesContext";
  private static final String EXTEND_WITH = "org.junit.jupiter.api.extension.ExtendWith";
  private static final List<String> CONTEXT_ANNOTATIONS =
      Arrays.asList(
          "org.springframework.test.context.BootstrapWith",
          "org.springframework.test.context.ContextConfiguration",
          "org.springframework.test.context.junit.jupiter.SpringJUnitConfig",
          "org.testcontainers.junit.jupiter.Testcontainers");
  private static final Set<String> INTEGRATION_SEGMENTS = Set.of("integration", "it");

  private TestRules() {}

  static void check(JavaClasses test, Set<Found> sink) {
    for (JavaClass type : test) {
      JavaClass owner = Spring.owner(type);
      if (startsContext(type) && !inIntegrationPackage(owner)) {
        Found.add(sink, PLACEMENT, type, "");
      }
      if (dirtiesContext(type)) {
        Found.add(sink, DIRTIES_CONTEXT, type, "");
      }
    }
  }

  private static boolean startsContext(JavaClass type) {
    return CONTEXT_ANNOTATIONS.stream().anyMatch(type::isMetaAnnotatedWith) || extendsWithSpring(type);
  }

  private static boolean extendsWithSpring(JavaClass type) {
    for (JavaAnnotation<JavaClass> annotation : type.getAnnotations()) {
      if (annotation.getRawType().getName().equals(EXTEND_WITH) && names(annotation).contains("SpringExtension")) {
        return true;
      }
    }
    return false;
  }

  private static String names(JavaAnnotation<JavaClass> annotation) {
    Object value = annotation.get("value").orElse("");
    return value instanceof Object[] ? Arrays.toString((Object[]) value) : String.valueOf(value);
  }

  private static boolean inIntegrationPackage(JavaClass type) {
    return Arrays.stream(type.getPackageName().split("\\.")).anyMatch(INTEGRATION_SEGMENTS::contains);
  }

  private static boolean dirtiesContext(JavaClass type) {
    return type.isMetaAnnotatedWith(DIRTIES)
        || type.getMethods().stream().anyMatch((JavaMethod method) -> method.isMetaAnnotatedWith(DIRTIES));
  }
}
