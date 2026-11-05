import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaEnumConstant;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.domain.JavaType;
import com.tngtech.archunit.core.domain.properties.HasAnnotations;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.stream.Collectors;

final class RequestBodies {
  static final String TYPED_REQUEST_FIELD = "spring-typed-request-field";
  private static final String WEB = "org.springframework.web.bind.annotation.";
  private static final String MESSAGING = "org.springframework.messaging.";
  private static final List<String> BODIES =
      List.of(WEB + "RequestBody", WEB + "RequestPart", WEB + "ModelAttribute");
  private static final List<String> MESSAGE_HANDLERS =
      List.of(MESSAGING + "handler.annotation.MessageMapping", MESSAGING + "simp.annotation.SubscribeMapping");
  private static final String PAYLOAD = MESSAGING + "handler.annotation.Payload";
  private static final List<String> NOT_PAYLOAD =
      List.of(MESSAGING + "handler.annotation.Header", MESSAGING + "handler.annotation.Headers",
          MESSAGING + "handler.annotation.DestinationVariable");
  private static final String JACKSON = "com.fasterxml.jackson.annotation.";
  private static final String ANY_SETTER = JACKSON + "JsonAnySetter";
  private static final String IGNORE = JACKSON + "JsonIgnore";
  private static final String PROPERTY = JACKSON + "JsonProperty";
  private static final String READ_ONLY = "READ_ONLY";
  private static final List<String> POLYMORPHIC = List.of(JACKSON + "JsonTypeInfo", JACKSON + "JsonSubTypes");
  private static final List<String> DESERIALIZERS =
      List.of("com.fasterxml.jackson.databind.annotation.JsonDeserialize",
          "tools.jackson.databind.annotation.JsonDeserialize");
  private static final Set<JavaModifier> SKIPPED =
      Set.of(JavaModifier.STATIC, JavaModifier.TRANSIENT, JavaModifier.SYNTHETIC);
  private static final String FIELD = "field";
  private static final String ANY = "any-setter";
  private static final int DEPTH = 16;

  private final JavaClasses main;
  private final UntypedTypes types;
  private final Map<String, Member> found = new TreeMap<>();
  private final Set<String> visited = new HashSet<>();

  private RequestBodies(JavaClasses main) {
    this.main = main;
    this.types = new UntypedTypes(main);
  }

  static void check(JavaClasses main, Roles roles, Set<Found> sink) {
    RequestBodies bodies = new RequestBodies(main);
    main.stream()
        .filter(roles::isController)
        .sorted(Comparator.comparing(JavaClass::getName))
        .forEach(bodies::controller);
    bodies.found.values().forEach(member -> Found.add(sink, TYPED_REQUEST_FIELD, member.owner, member.detail()));
  }

  private void controller(JavaClass controller) {
    List<JavaClass> declaring = new ArrayList<>();
    declaring.add(controller);
    controller.getAllRawSuperclasses().stream().filter(this::isProject).forEach(declaring::add);
    controller.getAllRawInterfaces().stream()
        .filter(this::isProject)
        .sorted(Comparator.comparing(JavaClass::getName))
        .forEach(declaring::add);
    for (JavaClass type : declaring) {
      for (JavaMethod method : sorted(type.getMethods(), JavaMethod::getFullName)) {
        String handler = controller.getSimpleName() + "." + method.getName();
        boolean message = MESSAGE_HANDLERS.stream().anyMatch(method::isMetaAnnotatedWith);
        for (JavaParameter parameter : method.getParameters()) {
          if (isBound(parameter, message)) {
            types.projectTypes(parameter.getType(), Map.of(), (held, bindings) -> walk(held, bindings, handler, 0));
          }
        }
      }
    }
  }

  private static boolean isBound(JavaParameter parameter, boolean message) {
    return BODIES.stream().anyMatch(parameter::isMetaAnnotatedWith)
        || (message && (parameter.isMetaAnnotatedWith(PAYLOAD)
            || NOT_PAYLOAD.stream().noneMatch(parameter::isMetaAnnotatedWith)));
  }

  private void walk(JavaClass type, Map<String, JavaType> bindings, String handler, int depth) {
    if (type.isEnum() || depth > DEPTH || !visited.add(type.getName() + describe(bindings))) {
      return;
    }
    if (POLYMORPHIC.stream().anyMatch(type::isAnnotatedWith)) {
      sorted(type.getAllSubclasses(), JavaClass::getName).stream()
          .filter(this::isProject)
          .forEach(subtype -> walk(subtype, Map.of(), handler, depth + 1));
    }
    JavaClass current = type;
    Map<String, JavaType> bound = bindings;
    while (isProject(current)) {
      members(current, bound, handler, depth);
      Optional<JavaType> superclass = current.getSuperclass();
      if (superclass.isEmpty()) {
        return;
      }
      bound = HeldTypes.bindingsOf(superclass.get(), bound);
      current = superclass.get().toErasure();
    }
  }

  private void members(JavaClass type, Map<String, JavaType> bindings, String handler, int depth) {
    for (JavaField field : sorted(type.getFields(), JavaField::getName)) {
      if (isSkipped(field)) {
        continue;
      }
      if (isAnySetter(field)) {
        record(type, field.getName(), ANY, handler);
      } else if (types.isUntyped(field.getType(), bindings)) {
        record(type, field.getName(), FIELD, handler);
      }
      types.projectTypes(field.getType(), bindings, (held, bound) -> walk(held, bound, handler, depth + 1));
    }
    for (JavaMethod method : sorted(type.getMethods(), JavaMethod::getFullName)) {
      if (!method.getModifiers().contains(JavaModifier.SYNTHETIC) && isAnySetter(method)) {
        record(type, method.getName(), ANY, handler);
      }
    }
  }

  private void record(JavaClass type, String name, String kind, String handler) {
    found.putIfAbsent(type.getName() + "#" + name, new Member(type, name, kind, handler));
  }

  private boolean isProject(JavaClass type) {
    return main.contain(type.getName());
  }

  private static boolean isSkipped(JavaField field) {
    return field.getModifiers().stream().anyMatch(SKIPPED::contains)
        || isEnabled(field, IGNORE, "value")
        || DESERIALIZERS.stream().anyMatch(field::isAnnotatedWith)
        || field.tryGetAnnotationOfType(PROPERTY)
            .flatMap(property -> property.get("access"))
            .filter(RequestBodies::isReadOnly)
            .isPresent();
  }

  private static boolean isReadOnly(Object access) {
    return access instanceof JavaEnumConstant && ((JavaEnumConstant) access).name().equals(READ_ONLY);
  }

  private static boolean isAnySetter(HasAnnotations<?> member) {
    return isEnabled(member, ANY_SETTER, "enabled");
  }

  private static boolean isEnabled(HasAnnotations<?> member, String annotation, String switchName) {
    return member.tryGetAnnotationOfType(annotation)
        .map(found -> !Boolean.FALSE.equals(found.get(switchName).orElse(Boolean.TRUE)))
        .orElse(false);
  }

  private static String describe(Map<String, JavaType> bindings) {
    return new TreeMap<>(bindings.entrySet().stream()
        .collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().getName()))).toString();
  }

  private static <T> List<T> sorted(Set<T> members, java.util.function.Function<T, String> key) {
    return members.stream().sorted(Comparator.comparing(key)).collect(Collectors.toList());
  }

  private static final class Member {
    private final JavaClass owner;
    private final String name;
    private final String kind;
    private final String handler;

    private Member(JavaClass owner, String name, String kind, String handler) {
      this.owner = owner;
      this.name = name;
      this.kind = kind;
      this.handler = handler;
    }

    private String detail() {
      return owner.getSimpleName() + "." + name + ":" + kind + ":" + handler;
    }
  }
}
