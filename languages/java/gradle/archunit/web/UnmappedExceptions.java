import com.tngtech.archunit.core.domain.AccessTarget;
import com.tngtech.archunit.core.domain.JavaAccess;
import com.tngtech.archunit.core.domain.JavaAnnotation;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaConstructorCall;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

final class UnmappedExceptions {
  static final String RULE = "spring-unmapped-exception";
  private static final String WEB = "org.springframework.web.bind.annotation.";
  private static final String MAPPING = WEB + "RequestMapping";
  private static final String HANDLER = WEB + "ExceptionHandler";
  private static final String ADVICE = WEB + "ControllerAdvice";
  private static final String RESPONSE_STATUS = WEB + "ResponseStatus";
  private static final List<String> RESOLVERS =
      List.of("org.springframework.web.servlet.HandlerExceptionResolver",
          "org.springframework.web.server.WebExceptionHandler");
  private static final Set<String> CATCH_ALL =
      Set.of("java.lang.Throwable", "java.lang.Exception", "java.lang.RuntimeException");
  private static final String THROWABLE = "java.lang.Throwable";
  private static final String JDK = "java.";
  private static final int DEPTH = 4;
  private static final int MAX_UNITS = 200;

  private final JavaClasses main;
  private final Set<String> global = new HashSet<>();
  private final Map<JavaClass, Optional<Set<String>>> sites = new HashMap<>();

  private UnmappedExceptions(JavaClasses main) {
    this.main = main;
    main.stream().filter(type -> type.isMetaAnnotatedWith(ADVICE)).forEach(type -> handled(type, global));
  }

  static void check(JavaClasses main, Roles roles, Set<Found> sink) {
    if (main.stream().anyMatch(type -> RESOLVERS.stream().anyMatch(type::isAssignableTo))) {
      return;
    }
    UnmappedExceptions rule = new UnmappedExceptions(main);
    main.stream()
        .filter(roles::isController)
        .sorted(Comparator.comparing(JavaClass::getName))
        .forEach(controller -> rule.controller(controller, sink));
  }

  private void controller(JavaClass controller, Set<Found> sink) {
    Set<String> local = new HashSet<>(global);
    handled(controller, local);
    routes(controller).forEach(route -> thrown(route).forEach((raised, path) -> {
      if (!isMapped(raised, local)) {
        Found.add(sink, RULE, controller, route.getName() + ":" + label(raised) + ":" + path);
      }
    }));
  }

  private List<JavaMethod> routes(JavaClass controller) {
    Set<String> declared = new HashSet<>();
    List<JavaMethod> found = new ArrayList<>();
    for (JavaClass type : controller.getClassHierarchy()) {
      if (!isProject(type)) {
        break;
      }
      type.getMethods().stream()
          .filter(method -> declared.add(method.getName() + parameterNames(method.getRawParameterTypes())))
          .filter(method -> isRoute(controller, method))
          .sorted(Comparator.comparing(JavaMethod::getFullName))
          .forEach(found::add);
    }
    return found;
  }

  private static void handled(JavaClass type, Set<String> sink) {
    for (JavaMethod method : type.getAllMethods()) {
      method.tryGetAnnotationOfType(HANDLER).ifPresent(annotation -> handledBy(method, annotation, sink));
    }
  }

  private static void handledBy(JavaMethod method, JavaAnnotation<JavaMethod> annotation, Set<String> sink) {
    Object value = annotation.get("value").orElse(new Object[0]);
    List<JavaClass> classes = Stream.of((Object[]) value)
        .filter(JavaClass.class::isInstance)
        .map(JavaClass.class::cast)
        .collect(Collectors.toList());
    if (classes.isEmpty()) {
      method.getRawParameterTypes().stream().filter(type -> type.isAssignableTo(THROWABLE)).forEach(classes::add);
    }
    for (JavaClass handled : classes) {
      if (CATCH_ALL.contains(handled.getName())) {
        method.getOwner().getMethods().stream()
            .flatMap(helper -> helper.getInstanceofChecks().stream())
            .forEach(check -> sink.add(check.getRawType().getName()));
      } else {
        sink.add(handled.getName());
      }
    }
  }

  private static boolean isRoute(JavaClass controller, JavaMethod method) {
    Set<JavaModifier> modifiers = method.getModifiers();
    if (modifiers.contains(JavaModifier.SYNTHETIC) || modifiers.contains(JavaModifier.BRIDGE)) {
      return false;
    }
    String[] parameters = parameterNames(method.getRawParameterTypes());
    return Stream.concat(Stream.of(controller), Stream.concat(
            controller.getAllRawSuperclasses().stream(), controller.getAllRawInterfaces().stream()))
        .map(type -> type.tryGetMethod(method.getName(), parameters))
        .flatMap(Optional::stream)
        .anyMatch(candidate -> candidate.isMetaAnnotatedWith(MAPPING));
  }

  private boolean isMapped(JavaClass raised, Set<String> handled) {
    return raised.getClassHierarchy().stream().anyMatch(type -> handled.contains(type.getName())
        || type.isMetaAnnotatedWith(RESPONSE_STATUS)
        || (!isProject(type) && !type.getName().startsWith(JDK)));
  }

  private Map<JavaClass, String> thrown(JavaMethod route) {
    Map<JavaClass, String> found = new LinkedHashMap<>();
    Set<JavaCodeUnit> seen = new HashSet<>(List.of(route));
    Deque<Step> pending = new ArrayDeque<>(List.of(new Step(route, List.of(), 0)));
    while (!pending.isEmpty() && seen.size() <= MAX_UNITS) {
      Step step = pending.removeFirst();
      raisedIn(step.unit).forEach(raised -> found.putIfAbsent(raised, String.join(",", step.path)));
      if (step.depth < DEPTH) {
        for (JavaCodeUnit callee : callees(step.unit)) {
          if (seen.add(callee)) {
            pending.addLast(step.into(callee));
          }
        }
      }
    }
    return found;
  }

  private List<JavaClass> raisedIn(JavaCodeUnit unit) {
    Stream<JavaClass> built = Stream.concat(
        unit.getConstructorCallsFromSelf().stream().filter(this::isThrown).map(JavaAccess::getTargetOwner),
        unit.getConstructorReferencesFromSelf().stream().map(JavaAccess::getTargetOwner));
    return built.filter(this::isProject).filter(type -> type.isAssignableTo(THROWABLE)).collect(Collectors.toList());
  }

  private boolean isThrown(JavaConstructorCall call) {
    if (!isOpen(call)) {
      return false;
    }
    Optional<Set<String>> known = sites.computeIfAbsent(call.getOriginOwner(), ThrowSites::of);
    return known.map(found -> found.contains(ThrowSites.key(call.getTargetOwner().getName(), call.getLineNumber())))
        .orElse(true);
  }

  private List<JavaCodeUnit> callees(JavaCodeUnit unit) {
    Stream<AccessTarget.CodeUnitAccessTarget> calls = unit.getMethodCallsFromSelf().stream()
        .filter(UnmappedExceptions::isOpen)
        .map(call -> call.getTarget());
    Stream<AccessTarget.CodeUnitAccessTarget> references =
        unit.getMethodReferencesFromSelf().stream().map(reference -> reference.getTarget());
    Stream<JavaCodeUnit> methods = Stream.concat(calls, references).flatMap(this::implementations);
    Stream<JavaCodeUnit> constructors = unit.getConstructorCallsFromSelf().stream()
        .filter(UnmappedExceptions::isOpen)
        .filter(call -> isProject(call.getTargetOwner()) && !call.getTargetOwner().isAssignableTo(THROWABLE))
        .flatMap(call -> call.getTarget().resolveMember().stream().map(JavaCodeUnit.class::cast));
    return Stream.concat(methods, constructors).collect(Collectors.toList());
  }

  private Stream<JavaCodeUnit> implementations(AccessTarget.CodeUnitAccessTarget target) {
    JavaClass owner = target.getOwner();
    if (!isProject(owner)) {
      return Stream.empty();
    }
    String[] parameters = parameterNames(target.getRawParameterTypes());
    Stream<JavaCodeUnit> declared = target.resolveMember().stream().map(JavaCodeUnit.class::cast);
    Stream<JavaCodeUnit> overrides = owner.getAllSubclasses().stream()
        .map(type -> type.tryGetMethod(target.getName(), parameters))
        .flatMap(Optional::stream)
        .map(JavaCodeUnit.class::cast);
    return Stream.concat(declared, overrides)
        .filter(unit -> isProject(unit.getOwner()) && !unit.getModifiers().contains(JavaModifier.ABSTRACT));
  }

  private static boolean isOpen(JavaAccess<?> access) {
    return access.getContainingTryBlocks().stream().allMatch(block -> block.getCaughtThrowables().isEmpty());
  }

  private boolean isProject(JavaClass type) {
    return main.contain(type.getName());
  }

  private static String[] parameterNames(List<JavaClass> types) {
    return types.stream().map(JavaClass::getName).toArray(String[]::new);
  }

  static String label(JavaClass type) {
    String name = type.getName();
    return name.substring(name.lastIndexOf('.') + 1).replace('$', '.');
  }

  private static final class Step {
    private final JavaCodeUnit unit;
    private final List<String> path;
    private final int depth;

    private Step(JavaCodeUnit unit, List<String> path, int depth) {
      this.unit = unit;
      this.path = path;
      this.depth = depth;
    }

    private Step into(JavaCodeUnit callee) {
      Set<JavaModifier> modifiers = callee.getModifiers();
      if (modifiers.contains(JavaModifier.SYNTHETIC) || modifiers.contains(JavaModifier.BRIDGE)) {
        return new Step(callee, path, depth);
      }
      List<String> longer = new ArrayList<>(path);
      String owner = label(callee.getOwner());
      longer.add(callee.isConstructor() ? "new " + owner : owner + "." + callee.getName());
      return new Step(callee, longer, depth + 1);
    }
  }
}
