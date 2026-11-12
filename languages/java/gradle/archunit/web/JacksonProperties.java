import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaEnumConstant;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.properties.HasAnnotations;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.Set;

final class JacksonProperties {
  private static final String JACKSON = "com.fasterxml.jackson.annotation.";
  private static final String ANY_SETTER = JACKSON + "JsonAnySetter";
  private static final String IGNORE = JACKSON + "JsonIgnore";
  private static final String IGNORE_PROPERTIES = JACKSON + "JsonIgnoreProperties";
  private static final String AUTO_DETECT = JACKSON + "JsonAutoDetect";
  private static final String PROPERTY = JACKSON + "JsonProperty";
  private static final String READ_ONLY = "READ_ONLY";
  private static final List<String> DESERIALIZERS =
      List.of("com.fasterxml.jackson.databind.annotation.JsonDeserialize",
          "tools.jackson.databind.annotation.JsonDeserialize");
  private static final Set<JavaModifier> SKIPPED =
      Set.of(JavaModifier.STATIC, JavaModifier.TRANSIENT, JavaModifier.SYNTHETIC);
  private static final List<String> ACCESSOR_PREFIXES = List.of("", "get", "is", "set");

  private JacksonProperties() {}

  static boolean isBound(JavaField field) {
    JavaClass owner = field.getOwner();
    List<JavaMethod> accessors = accessorsOf(field);
    return field.getModifiers().stream().noneMatch(SKIPPED::contains)
        && (field.getModifiers().contains(JavaModifier.PUBLIC) || owner.isRecord() || !accessors.isEmpty()
            || owner.isAnnotatedWith(AUTO_DETECT) || hasJacksonAnnotation(field))
        && !isEnabled(field, IGNORE, "value")
        && accessors.stream().noneMatch(accessor -> isEnabled(accessor, IGNORE, "value"))
        && !ignoredByOwner(owner, field.getName())
        && DESERIALIZERS.stream().noneMatch(field::isAnnotatedWith)
        && !field.tryGetAnnotationOfType(PROPERTY)
            .flatMap(property -> property.get("access"))
            .filter(JacksonProperties::isReadOnly)
            .isPresent();
  }

  static boolean isAnySetter(HasAnnotations<?> member) {
    return isEnabled(member, ANY_SETTER, "enabled");
  }

  private static List<JavaMethod> accessorsOf(JavaField field) {
    String name = field.getName();
    String capitalized = name.isEmpty() ? name : Character.toUpperCase(name.charAt(0)) + name.substring(1);
    return field.getOwner().getMethods().stream()
        .filter(method -> !method.getModifiers().contains(JavaModifier.STATIC))
        .filter(method -> method.getName().equals(name)
            || ACCESSOR_PREFIXES.stream().anyMatch(prefix -> method.getName().equals(prefix + capitalized)))
        .collect(java.util.stream.Collectors.toList());
  }

  private static boolean hasJacksonAnnotation(JavaField field) {
    return field.getAnnotations().stream()
        .anyMatch(annotation -> annotation.getRawType().getName().startsWith(JACKSON));
  }

  private static boolean ignoredByOwner(JavaClass owner, String name) {
    Optional<JavaAnnotation<JavaClass>> ignored = owner.tryGetAnnotationOfType(IGNORE_PROPERTIES);
    return ignored.flatMap(annotation -> annotation.get("value"))
        .filter(value -> value instanceof Object[])
        .map(value -> Arrays.asList((Object[]) value).contains(name))
        .orElse(false);
  }

  private static boolean isReadOnly(Object access) {
    return access instanceof JavaEnumConstant && ((JavaEnumConstant) access).name().equals(READ_ONLY);
  }

  private static boolean isEnabled(HasAnnotations<?> member, String annotation, String switchName) {
    return member.tryGetAnnotationOfType(annotation)
        .map(found -> !Boolean.FALSE.equals(found.get(switchName).orElse(Boolean.TRUE)))
        .orElse(false);
  }
}
