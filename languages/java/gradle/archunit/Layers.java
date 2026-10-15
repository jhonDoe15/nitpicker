import com.tngtech.archunit.core.domain.Dependency;
import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.domain.JavaMethod;
import com.tngtech.archunit.core.domain.JavaType;
import java.util.Set;

final class Layers {
  static final String CONTROLLER_REPOSITORY = "spring-controller-repository";
  static final String CONTROLLER_ENTITY = "spring-controller-entity";
  static final String SERVICE_WEB = "spring-service-web";
  private static final String MAPPING = "org.springframework.web.bind.annotation.RequestMapping";

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
    for (JavaMethod method : type.getMethods()) {
      if (!method.isMetaAnnotatedWith(MAPPING)) {
        continue;
      }
      signatureTypes(method).stream()
          .filter(Spring::isEntity)
          .forEach(
              entity ->
                  Found.add(sink, CONTROLLER_ENTITY, type, method.getName() + ":" + entity.getName()));
    }
  }

  private static Set<JavaClass> signatureTypes(JavaMethod method) {
    Set<JavaClass> types = new java.util.LinkedHashSet<>(method.getReturnType().getAllInvolvedRawTypes());
    for (JavaType parameter : method.getParameterTypes()) {
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
  }
}
