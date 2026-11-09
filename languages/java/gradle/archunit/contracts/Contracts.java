import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaModifier;
import com.tngtech.archunit.core.domain.JavaType;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class Contracts {
  static final String RULE = "contract-infrastructure-type";
  static final String SERVICE = "service";
  static final String CONTROLLER = "controller";
  static final String FEATURE = "feature";
  static final String PACKAGE = "package";
  private static final String BEAN = "org.springframework.context.annotation.Bean";
  private static final List<String> RESOURCE_ANNOTATIONS =
      List.of("jakarta.ws.rs.Path", "javax.ws.rs.Path", "io.micronaut.http.annotation.Controller");
  private static final String CLIENT_SUFFIX = "Client";
  private static final Set<String> INFRASTRUCTURE_NAMES =
      Set.of(
          "adapter", "adapters", "infrastructure", "infra", "persistence", "repository", "repositories", "db",
          "database", "dependencies", "deps", "config", "configuration", "security");

  private final JavaClasses main;
  private final String root;
  private final Roles roles;
  private final Set<Found> sink;

  private Contracts(JavaClasses main, String root, Roles roles, Set<Found> sink) {
    this.main = main;
    this.root = root;
    this.roles = roles;
    this.sink = sink;
  }

  static void check(JavaClasses main, String root, Roles roles, Set<Found> sink) {
    new Contracts(main, root, roles, sink).checkAll();
  }

  private void checkAll() {
    for (JavaClass type : main) {
      String face = faceOf(type);
      if (face == null) {
        continue;
      }
      for (JavaMethod method : ContractMethods.of(type, main)) {
        signatureTypes(method).forEach(leaked -> report(face, method, leaked));
      }
    }
  }

  private void report(String face, JavaMethod method, JavaClass leaked) {
    String kind = InfrastructureTypes.kindOf(leaked, roles);
    boolean handler = takesRequestFirst(method) || isOutboundClient(method.getOwner());
    boolean webEntry = handler && InfrastructureTypes.TRANSPORT.equals(kind);
    if (kind == null || webEntry || coveredElsewhere(face, kind, method.getOwner(), leaked)) {
      return;
    }
    JavaClass type = method.getOwner();
    String label = type.equals(Spring.owner(type)) ? method.getName() : type.getSimpleName() + "." + method.getName();
    Found.add(sink, RULE, type, face + "|" + kind + "|" + label + ":" + leaked.getName());
  }

  private boolean coveredElsewhere(String face, String kind, JavaClass type, JavaClass leaked) {
    if (face.equals(CONTROLLER)) {
      return kind.equals(InfrastructureTypes.TRANSPORT)
          || (roles.isController(Spring.owner(type)) && roles.isDataAccess(leaked));
    }
    return face.equals(SERVICE) && (roles.isWebLayer(leaked) || Spring.isResponseEntity(leaked));
  }

  private static boolean isOutboundClient(JavaClass type) {
    return Spring.owner(type).getSimpleName().endsWith(CLIENT_SUFFIX);
  }

  private static boolean takesRequestFirst(JavaMethod method) {
    List<JavaClass> parameters = method.getRawParameterTypes();
    return !parameters.isEmpty() && InfrastructureTypes.isRequest(parameters.get(0));
  }

  private String faceOf(JavaClass type) {
    JavaClass owner = Spring.owner(type);
    if (!isPublic(type) || !isPublic(owner) || Spring.isGenerated(type) || frameworkOwned(owner)) {
      return null;
    }
    if (isController(owner)) {
      return CONTROLLER;
    }
    if (roles.isService(owner)) {
      return SERVICE;
    }
    return root != null && directlyInFeature(type.getPackageName()) ? FEATURE : PACKAGE;
  }

  private boolean isController(JavaClass owner) {
    return roles.isController(owner) || RESOURCE_ANNOTATIONS.stream().anyMatch(owner::isMetaAnnotatedWith);
  }

  private boolean frameworkOwned(JavaClass owner) {
    return roles.isRepository(owner)
        || owner.isMetaAnnotatedWith(Spring.CONFIGURATION)
        || (roles.isWebLayer(owner) && !roles.isController(owner))
        || inInfrastructurePackage(owner.getPackageName());
  }

  private static boolean inInfrastructurePackage(String packageName) {
    for (String segment : packageName.split("\\.")) {
      if (INFRASTRUCTURE_NAMES.contains(segment)) {
        return true;
      }
    }
    return false;
  }

  private boolean directlyInFeature(String packageName) {
    if (!packageName.startsWith(root + ".")) {
      return false;
    }
    String rest = packageName.substring(root.length() + 1);
    return !rest.contains(".") && Layout.isFeature(rest);
  }

  private static boolean isPublic(JavaClass type) {
    return type.getModifiers().contains(JavaModifier.PUBLIC);
  }

  private Set<JavaClass> signatureTypes(JavaMethod method) {
    Set<JavaClass> types = new LinkedHashSet<>(method.getReturnType().getAllInvolvedRawTypes());
    if (isFactory(method)) {
      return types;
    }
    for (JavaType parameter : method.getParameterTypes()) {
      types.addAll(parameter.getAllInvolvedRawTypes());
    }
    return types;
  }

  private boolean isFactory(JavaMethod method) {
    JavaClass owner = method.getOwner();
    boolean entry = method.getModifiers().contains(JavaModifier.STATIC) || isCompanion(owner);
    String name = method.getRawReturnType().getName();
    if (!entry || !main.contain(name)) {
      return false;
    }
    JavaClass returned = main.get(name);
    return returned.equals(Spring.owner(owner)) || !ContractMethods.of(returned, main).isEmpty();
  }

  private static boolean isCompanion(JavaClass type) {
    return type.getEnclosingClass()
        .map(outer -> outer.getFields().stream().anyMatch(field -> isInstanceField(field, type)))
        .orElse(false);
  }

  private static boolean isInstanceField(JavaField field, JavaClass type) {
    return field.getModifiers().contains(JavaModifier.STATIC) && field.getRawType().equals(type);
  }

  static boolean isBean(JavaMethod method) {
    return method.isMetaAnnotatedWith(BEAN);
  }

  static List<JavaMethod> publicMethods(JavaClass type) {
    List<JavaMethod> methods = new ArrayList<>();
    for (JavaMethod method : type.getMethods()) {
      Set<JavaModifier> modifiers = method.getModifiers();
      if (modifiers.contains(JavaModifier.PUBLIC)
          && !modifiers.contains(JavaModifier.SYNTHETIC)
          && !modifiers.contains(JavaModifier.BRIDGE)
          && !method.getName().contains("$")
          && !isBean(method)) {
        methods.add(method);
      }
    }
    return methods;
  }
}
