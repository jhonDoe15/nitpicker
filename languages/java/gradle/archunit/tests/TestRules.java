import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import java.util.ArrayList;
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
  private static final List<String> OWN_CONFIGURATIONS =
      Arrays.asList(
          "org.springframework.context.annotation.Configuration",
          "org.springframework.boot.test.context.TestConfiguration");
  private static final List<String> REPLACED_BEANS =
      Arrays.asList(
          "org.springframework.test.context.bean.override.mockito.MockitoBean",
          "org.springframework.test.context.bean.override.mockito.MockitoSpyBean",
          "org.springframework.boot.test.mock.mockito.MockBean",
          "org.springframework.boot.test.mock.mockito.SpyBean");
  private static final String DYNAMIC_PROPERTIES = "org.springframework.test.context.DynamicPropertySource";

  private TestRules() {}

  static void check(JavaClasses unitTests, JavaClasses otherTests, Set<Found> sink) {
    for (JavaClass type : unitTests) {
      if (isConcreteClass(type) && startsContext(type)) {
        Found.add(sink, PLACEMENT, type, "");
      }
    }
    for (JavaClasses tests : List.of(unitTests, otherTests)) {
      for (JavaClass type : tests) {
        if (dirtiesContext(type, tests)) {
          Found.add(sink, DIRTIES_CONTEXT, type, "");
        }
      }
    }
  }

  private static boolean isConcreteClass(JavaClass type) {
    return !type.isAnnotation() && !type.isInterface() && !type.getModifiers().contains(JavaModifier.ABSTRACT);
  }

  private static boolean startsContext(JavaClass type) {
    List<JavaClass> hierarchy = new ArrayList<>();
    hierarchy.add(type);
    hierarchy.addAll(type.getAllRawSuperclasses());
    return hierarchy.stream().anyMatch(TestRules::declaresContext);
  }

  private static boolean declaresContext(JavaClass type) {
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

  private static boolean dirtiesContext(JavaClass type, JavaClasses tests) {
    boolean onMethod = type.getMethods().stream().anyMatch((JavaMethod method) -> method.isMetaAnnotatedWith(DIRTIES));
    return onMethod || (type.isMetaAnnotatedWith(DIRTIES) && !(closesOnce(type) && ownsContext(type, tests)));
  }

  private static boolean closesOnce(JavaClass type) {
    return type.tryGetAnnotationOfType(DIRTIES)
        .map(annotation -> !String.valueOf(annotation.get("classMode").orElse("")).contains("EACH_TEST_METHOD"))
        .orElse(false);
  }

  private static boolean ownsContext(JavaClass type, JavaClasses tests) {
    for (JavaClass nested : tests) {
      boolean inside = nested.getEnclosingClass().map(type::equals).orElse(false);
      if (inside && OWN_CONFIGURATIONS.stream().anyMatch(nested::isMetaAnnotatedWith)) {
        return true;
      }
    }
    return type.getFields().stream().anyMatch(field -> REPLACED_BEANS.stream().anyMatch(field::isMetaAnnotatedWith))
        || type.getMethods().stream().anyMatch(method -> method.isMetaAnnotatedWith(DYNAMIC_PROPERTIES));
  }
}
