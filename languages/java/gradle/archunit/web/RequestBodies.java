import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaParameter;
import com.tngtech.archunit.core.domain.JavaType;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
  private static final String HTTP_ENTITY = "org.springframework.http.HttpEntity";
  private static final List<String> NEUTRAL =
      List.of("org.jetbrains.annotations.", "org.jspecify.", "javax.annotation.", "jakarta.annotation.",
          "javax.validation.", "jakarta.validation.", "org.springframework.validation.annotation.",
          "org.springframework.lang.", "kotlin.");
  private static final List<String> POLYMORPHIC =
      List.of("com.fasterxml.jackson.annotation.JsonTypeInfo", "com.fasterxml.jackson.annotation.JsonSubTypes");
  private static final String FIELD = "field";
  private static final String ANY = "any-setter";
  private static final int DEPTH = 32;

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
    Map<JavaClass, Map<String, UntypedTypes.Bound>> declaring = new LinkedHashMap<>();
    declare(controller, Map.of(), declaring, 0);
    declaring.forEach((type, scope) -> {
      for (JavaMethod method : sorted(type.getMethods(), JavaMethod::getFullName)) {
        String handler = controller.getSimpleName() + "." + method.getName();
        boolean message = MESSAGE_HANDLERS.stream().anyMatch(method::isMetaAnnotatedWith);
        for (JavaParameter parameter : method.getParameters()) {
          if (isBound(parameter, message)) {
            types.projectTypes(parameter.getType(), scope, (held, bound) -> walk(held, bound, handler, 0));
          }
        }
      }
    });
  }

  private void declare(
      JavaClass type, Map<String, UntypedTypes.Bound> scope, Map<JavaClass, Map<String, UntypedTypes.Bound>> sink,
      int depth) {
    if (!isProject(type) || sink.containsKey(type) || depth > DEPTH) {
      return;
    }
    sink.put(type, scope);
    List<JavaType> supertypes = new ArrayList<>();
    type.getSuperclass().ifPresent(supertypes::add);
    supertypes.addAll(sorted(type.getInterfaces(), JavaType::getName));
    for (JavaType supertype : supertypes) {
      declare(supertype.toErasure(), types.supertypeScope(supertype, scope), sink, depth + 1);
    }
  }

  private static boolean isBound(JavaParameter parameter, boolean message) {
    if (BODIES.stream().anyMatch(parameter::isMetaAnnotatedWith)
        || parameter.getRawType().isAssignableTo(HTTP_ENTITY)) {
      return true;
    }
    return message && (parameter.isMetaAnnotatedWith(PAYLOAD) || parameter.getAnnotations().stream()
        .allMatch(annotation -> NEUTRAL.stream().anyMatch(annotation.getRawType().getName()::startsWith)));
  }

  private void walk(JavaClass type, Map<String, UntypedTypes.Bound> scope, String handler, int depth) {
    if (type.isEnum() || depth > DEPTH || !visited.add(type.getName() + UntypedTypes.describe(scope, 0))) {
      return;
    }
    if (POLYMORPHIC.stream().anyMatch(type::isAnnotatedWith)) {
      sorted(type.getAllSubclasses(), JavaClass::getName).stream()
          .filter(this::isProject)
          .forEach(subtype -> walk(subtype, Map.of(), handler, depth + 1));
    }
    JavaClass current = type;
    Map<String, UntypedTypes.Bound> bound = scope;
    while (isProject(current)) {
      members(current, bound, handler, depth);
      Optional<JavaType> superclass = current.getSuperclass();
      if (superclass.isEmpty()) {
        return;
      }
      bound = types.supertypeScope(superclass.get(), bound);
      current = superclass.get().toErasure();
    }
  }

  private void members(JavaClass type, Map<String, UntypedTypes.Bound> scope, String handler, int depth) {
    for (JavaField field : sorted(type.getFields(), JavaField::getName)) {
      if (!JacksonProperties.isBound(field)) {
        continue;
      }
      if (JacksonProperties.isAnySetter(field)) {
        record(type, field.getName(), ANY, handler);
      } else if (types.isUntyped(field.getType(), scope)) {
        record(type, field.getName(), FIELD, handler);
      }
      types.projectTypes(field.getType(), scope, (held, bound) -> walk(held, bound, handler, depth + 1));
    }
    for (JavaMethod method : sorted(type.getMethods(), JavaMethod::getFullName)) {
      if (!method.getModifiers().contains(JavaModifier.SYNTHETIC) && JacksonProperties.isAnySetter(method)) {
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

    private static String displayName(JavaClass type) {
      String name = type.getName();
      return name.substring(name.lastIndexOf('.') + 1).replace('$', '.');
    }

    private String detail() {
      return displayName(owner) + "." + name + ":" + kind + ":" + handler;
    }
  }
}
