import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaCodeUnit;
import com.tngtech.archunit.core.domain.JavaField;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaType;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class Layers {
  static final String CONTROLLER_REPOSITORY = "spring-controller-repository";
  static final String CONTROLLER_ENTITY = "spring-controller-entity";
  static final String SERVICE_WEB = "spring-service-web";
  static final String CONTROLLER_CONTROLLER = "spring-controller-controller";
  static final String REPOSITORY_SERVICE = "spring-repository-service";
  static final Set<String> DEPENDENCY_RULES =
      Set.of(CONTROLLER_REPOSITORY, CONTROLLER_CONTROLLER, REPOSITORY_SERVICE, SERVICE_WEB);
  private static final List<String> HANDLER_ANNOTATIONS =
      List.of(
          "org.springframework.web.bind.annotation.RequestMapping",
          "org.springframework.web.bind.annotation.ModelAttribute");

  private Layers() {}

  static void check(JavaClasses main, Roles roles, Set<Found> sink) {
    for (JavaClass type : main) {
      JavaClass owner = Spring.owner(type);
      if (roles.isController(owner)) {
        controllerDependsOnRepository(type, roles, sink);
        controllerHoldsController(type, roles, sink);
        entityInSignature(type, sink);
      }
      if (roles.isService(owner) || roles.isRepository(owner)) {
        dependsOnWebLayer(type, roles, sink);
      }
      if (roles.isRepository(owner)) {
        repositoryDependsOnService(type, roles, sink);
      }
    }
  }

  private static void controllerDependsOnRepository(JavaClass type, Roles roles, Set<Found> sink) {
    for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
      if (roles.isDataAccess(dependency.getTargetClass())) {
        Found.add(sink, CONTROLLER_REPOSITORY, type, dependency.getTargetClass().getName());
      }
    }
  }

  private static void controllerHoldsController(JavaClass type, Roles roles, Set<Found> sink) {
    JavaClass owner = Spring.owner(type);
    heldTypes(type).stream()
        .filter(target -> roles.isController(target) && !Spring.owner(target).equals(owner))
        .forEach(target -> Found.add(sink, CONTROLLER_CONTROLLER, type, target.getName()));
  }

  private static Set<JavaClass> heldTypes(JavaClass type) {
    Set<JavaClass> types = new LinkedHashSet<>();
    for (JavaField field : type.getFields()) {
      types.addAll(field.getType().getAllInvolvedRawTypes());
    }
    for (JavaCodeUnit codeUnit : type.getCodeUnits()) {
      for (JavaType parameter : codeUnit.getParameterTypes()) {
        types.addAll(parameter.getAllInvolvedRawTypes());
      }
    }
    return types;
  }

  private static void repositoryDependsOnService(JavaClass type, Roles roles, Set<Found> sink) {
    for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
      JavaClass target = dependency.getTargetClass();
      if (roles.isService(target) && !Spring.owner(target).equals(Spring.owner(type))) {
        Found.add(sink, REPOSITORY_SERVICE, type, target.getName());
      }
    }
  }

  private static void entityInSignature(JavaClass type, Set<Found> sink) {
    for (JavaMethod method : hierarchyMethods(type)) {
      if (HANDLER_ANNOTATIONS.stream().noneMatch(method::isMetaAnnotatedWith)) {
        continue;
      }
      signatureTypes(method).stream()
          .filter(Spring::isEntity)
          .forEach(
              entity ->
                  Found.add(sink, CONTROLLER_ENTITY, type, method.getName() + ":" + entity.getName()));
    }
  }

  private static Set<JavaMethod> hierarchyMethods(JavaClass type) {
    Set<JavaMethod> methods = new LinkedHashSet<>(type.getMethods());
    type.getAllRawSuperclasses().forEach(superclass -> methods.addAll(superclass.getMethods()));
    type.getAllRawInterfaces().forEach(implemented -> methods.addAll(implemented.getMethods()));
    return methods;
  }

  private static Set<JavaClass> signatureTypes(JavaCodeUnit codeUnit) {
    Set<JavaClass> types = new LinkedHashSet<>(codeUnit.getReturnType().getAllInvolvedRawTypes());
    for (JavaType parameter : codeUnit.getParameterTypes()) {
      types.addAll(parameter.getAllInvolvedRawTypes());
    }
    return types;
  }

  private static void dependsOnWebLayer(JavaClass type, Roles roles, Set<Found> sink) {
    for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
      JavaClass target = dependency.getTargetClass();
      if (roles.isWebLayer(target) && !Spring.owner(target).equals(Spring.owner(type))) {
        Found.add(sink, SERVICE_WEB, type, target.getName());
      }
    }
    ownSignatureTypes(type).stream()
        .filter(Spring::isResponseEntity)
        .forEach(target -> Found.add(sink, SERVICE_WEB, type, target.getName()));
  }

  private static Set<JavaClass> ownSignatureTypes(JavaClass type) {
    Set<JavaClass> types = new LinkedHashSet<>();
    for (JavaField field : type.getFields()) {
      types.addAll(field.getType().getAllInvolvedRawTypes());
    }
    for (JavaCodeUnit codeUnit : type.getCodeUnits()) {
      types.addAll(signatureTypes(codeUnit));
    }
    return types;
  }
}
