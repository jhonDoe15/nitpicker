package nitpicker.designfacts.facts;

import com.sun.source.tree.*;
import java.util.*;
import javax.lang.model.element.Modifier;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;

public final class Surface {
  private static final Set<String> QUIET =
      Set.of(
          "Override", "SuppressWarnings", "Deprecated", "SafeVarargs", "FunctionalInterface",
          "Nullable", "NonNull", "Nonnull", "NotNull", "CheckForNull", "VisibleForTesting",
          "CanIgnoreReturnValue", "CheckReturnValue", "Contract", "Generated", "Immutable",
          "ThreadSafe", "NotThreadSafe", "Beta");
  private static final Set<String> LOMBOK =
      Set.of(
          "Getter", "Setter", "Data", "Value", "Builder", "ToString", "EqualsAndHashCode",
          "NoArgsConstructor", "AllArgsConstructor", "RequiredArgsConstructor", "Slf4j", "Log",
          "Log4j2", "CommonsLog", "Accessors", "FieldDefaults", "With", "Singular", "Cleanup",
          "SneakyThrows", "Synchronized", "Jacksonized", "Delegate", "Generated");
  private static final List<String> QUIET_PACKAGES =
      List.of(
          "lombok.", "java.lang.", "org.jetbrains.annotations.", "org.checkerframework.",
          "org.jspecify.", "com.google.errorprone.annotations.", "javax.annotation.Nonnull",
          "javax.annotation.Nullable", "javax.annotation.CheckForNull", "jakarta.annotation.Nonnull",
          "jakarta.annotation.Nullable", "edu.umd.cs.findbugs.annotations.", "java.lang.annotation.");

  private final Project project;
  private final Lookup lookup;

  public Surface(Project project, Lookup lookup) {
    this.project = project;
    this.lookup = lookup;
  }

  public boolean exported(MethodInfo method) {
    if (!method.owner.exported()) {
      return false;
    }
    boolean visible = method.flags.contains(Modifier.PUBLIC);
    return visible || (method.owner.isInterface() && !method.flags.contains(Modifier.PRIVATE));
  }

  public boolean entry(MethodInfo method) {
    if (method.tree == null) {
      return false;
    }
    if (frameworkAnnotated(method.tree.getModifiers(), method.owner)
        || isMain(method)
        || (method.ctor && frameworkAnnotated(method.owner.tree.getModifiers(), method.owner))) {
      return true;
    }
    if (method.ctor || method.isStatic || objectMethod(method)) {
      return false;
    }
    if (Names.hasAnnotation(method.tree.getModifiers(), "Override")) {
      return true;
    }
    if (!lookup.overridden(method).isEmpty()) {
      return true;
    }
    return !method.flags.contains(Modifier.PRIVATE) && lookup.incomplete(method.owner)
        && method.flags.contains(Modifier.PUBLIC);
  }

  private static boolean objectMethod(MethodInfo method) {
    return (method.name.equals("toString") && method.params.isEmpty())
        || (method.name.equals("hashCode") && method.params.isEmpty())
        || (method.name.equals("equals") && method.params.size() == 1);
  }

  public static boolean isMain(MethodInfo method) {
    return method.name.equals("main") && method.isStatic && method.flags.contains(Modifier.PUBLIC)
        && method.params.size() == 1 && Names.typeText(method.returnType).equals("void");
  }

  private boolean frameworkAnnotated(ModifiersTree modifiers, TypeInfo owner) {
    for (AnnotationTree annotation : modifiers.getAnnotations()) {
      if (framework(annotation, owner)) {
        return true;
      }
    }
    return false;
  }

  private boolean framework(AnnotationTree annotation, TypeInfo owner) {
    List<String> parts = Names.segments(annotation.getAnnotationType());
    if (parts.isEmpty()) {
      return false;
    }
    String simple = parts.get(parts.size() - 1);
    Tree type = annotation.getAnnotationType();
    if (QUIET.contains(simple)
        || project.resolveTree(type, new Project.Site(owner.outer, owner.unit, Set.of())) != null
        || project.resolveTree(type, new Project.Site(owner, owner.unit, Set.of())) != null) {
      return false;
    }
    if (owner.unit.lombok && (LOMBOK.contains(parts.get(0)) || LOMBOK.contains(simple))) {
      return false;
    }
    String name = parts.size() > 1 ? String.join(".", parts) : owner.unit.single.get(simple);
    return name == null || QUIET_PACKAGES.stream().noneMatch(name::startsWith);
  }
}
