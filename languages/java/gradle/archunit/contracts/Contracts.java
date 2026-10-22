import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
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
  private static final String CONFIGURATION = "org.springframework.context.annotation.Configuration";
  private static final String BEAN = "org.springframework.context.annotation.Bean";
  private static final String KOTLIN_METADATA = "kotlin.Metadata";
  private static final Set<String> ADAPTER_PACKAGES =
      Set.of("adapter", "adapters", "infrastructure", "infra", "persistence");

  private Contracts() {}

  static void check(JavaClasses main, String root, Set<Found> sink) {
    for (JavaClass type : main) {
      String face = faceOf(type, root);
      if (face == null) {
        continue;
      }
      for (JavaMethod method : contractMethods(type, main)) {
        for (JavaClass leaked : signatureTypes(method)) {
          report(face, method, leaked, sink);
        }
      }
    }
  }

  private static void report(String face, JavaMethod method, JavaClass leaked, Set<Found> sink) {
    String kind = InfrastructureTypes.kindOf(leaked, isRepository(leaked));
    if (kind == null || coveredBySpringRules(face, kind, leaked)) {
      return;
    }
    JavaClass type = method.getOwner();
    String label = type.equals(Spring.owner(type)) ? method.getName() : type.getSimpleName() + "." + method.getName();
    Found.add(sink, RULE, type, face + "|" + kind + "|" + label + ":" + leaked.getName());
  }

  private static boolean coveredBySpringRules(String face, String kind, JavaClass leaked) {
    if (face.equals(CONTROLLER)) {
      return kind.equals(InfrastructureTypes.TRANSPORT) || isDataAccess(leaked);
    }
    return face.equals(SERVICE) && (isWebLayer(leaked) || Spring.isResponseEntity(leaked));
  }

  private static String faceOf(JavaClass type, String root) {
    JavaClass owner = Spring.owner(type);
    if (!isPublic(type) || !isPublic(owner) || Spring.isGenerated(type) || frameworkOwned(owner)) {
      return null;
    }
    if (isController(owner)) {
      return CONTROLLER;
    }
    if (isService(owner)) {
      return SERVICE;
    }
    return root != null && directlyInFeature(type.getPackageName(), root) ? FEATURE : PACKAGE;
  }

  private static boolean frameworkOwned(JavaClass owner) {
    return isRepository(owner)
        || owner.isMetaAnnotatedWith(CONFIGURATION)
        || (isWebLayer(owner) && !isController(owner))
        || inAdapterPackage(owner.getPackageName());
  }

  private static boolean inAdapterPackage(String packageName) {
    for (String segment : packageName.split("\\.")) {
      if (ADAPTER_PACKAGES.contains(segment)) {
        return true;
      }
    }
    return false;
  }

  private static boolean directlyInFeature(String packageName, String root) {
    if (!packageName.startsWith(root + ".")) {
      return false;
    }
    String rest = packageName.substring(root.length() + 1);
    return !rest.contains(".") && Layout.isFeature(rest);
  }

  private static boolean isPublic(JavaClass type) {
    return type.getModifiers().contains(JavaModifier.PUBLIC);
  }

  private static List<JavaMethod> contractMethods(JavaClass type, JavaClasses main) {
    boolean kotlin = type.isAnnotatedWith(KOTLIN_METADATA);
    List<JavaMethod> methods = new ArrayList<>();
    for (JavaMethod method : type.getMethods()) {
      if (isContractMethod(method, kotlin) && !overridesLibraryMethod(method, main)) {
        methods.add(method);
      }
    }
    return methods;
  }

  private static boolean isContractMethod(JavaMethod method, boolean kotlin) {
    Set<JavaModifier> modifiers = method.getModifiers();
    String name = method.getName();
    return modifiers.contains(JavaModifier.PUBLIC)
        && !modifiers.contains(JavaModifier.SYNTHETIC)
        && !modifiers.contains(JavaModifier.BRIDGE)
        && !name.contains("$")
        && !method.isMetaAnnotatedWith(BEAN)
        && !(kotlin && (name.equals("copy") || name.matches("component\\d+")));
  }

  private static boolean overridesLibraryMethod(JavaMethod method, JavaClasses main) {
    Set<JavaClass> supertypes = new LinkedHashSet<>(method.getOwner().getAllRawSuperclasses());
    supertypes.addAll(method.getOwner().getAllRawInterfaces());
    int arity = method.getRawParameterTypes().size();
    return supertypes.stream()
        .filter(supertype -> !main.contain(supertype.getName()))
        .flatMap(supertype -> supertype.getMethods().stream())
        .anyMatch(
            declared -> declared.getName().equals(method.getName()) && declared.getRawParameterTypes().size() == arity);
  }

  private static Set<JavaClass> signatureTypes(JavaMethod method) {
    Set<JavaClass> types = new LinkedHashSet<>(method.getReturnType().getAllInvolvedRawTypes());
    for (JavaType parameter : method.getParameterTypes()) {
      types.addAll(parameter.getAllInvolvedRawTypes());
    }
    return types;
  }

  private static boolean isController(JavaClass type) {
    return Spring.isController(type);
  }

  private static boolean isService(JavaClass type) {
    return Spring.isService(type);
  }

  private static boolean isRepository(JavaClass type) {
    return Spring.isRepository(type);
  }

  private static boolean isDataAccess(JavaClass type) {
    return Spring.isDataAccess(type);
  }

  private static boolean isWebLayer(JavaClass type) {
    return Spring.isWebLayer(type);
  }
}
