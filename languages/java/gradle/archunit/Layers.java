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
  private static final List<String> HANDLER_ANNOTATIONS =
      List.of(
          "org.springframework.web.bind.annotation.RequestMapping",
          "org.springframework.web.bind.annotation.ModelAttribute");

  private Layers() {}

  static void check(JavaClasses main, Set<Found> sink) {
    for (JavaClass type : main) {
      JavaClass owner = Spring.owner(type);
      if (Spring.isController(owner)) {
        controllerDependsOnRepository(type, sink);
        entityInSignature(type, sink);
      }
      if (Spring.isService(owner) || Spring.isRepository(owner)) {
        dependsOnWebLayer(type, sink);
      }
    }
  }

  private static void controllerDependsOnRepository(JavaClass type, Set<Found> sink) {
    for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
      if (Spring.isRepository(dependency.getTargetClass())) {
        Found.add(sink, CONTROLLER_REPOSITORY, type, dependency.getTargetClass().getName());
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

  private static void dependsOnWebLayer(JavaClass type, Set<Found> sink) {
    for (Dependency dependency : type.getDirectDependenciesFromSelf()) {
      JavaClass target = dependency.getTargetClass();
      if (Spring.isWebLayer(target) && !Spring.owner(target).equals(Spring.owner(type))) {
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
