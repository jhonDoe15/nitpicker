package nitpicker.designfacts.facts;

import com.sun.source.tree.*;
import java.nio.file.*;
import java.util.*;
import javax.lang.model.element.Modifier;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;

public final class Lombok {
  private static final List<String> REPLACING =
      List.of("Setter", "AllArgsConstructor", "Builder", "With", "Data");

  private Lombok() {}

  public static boolean disabledBy(Path directory, Path root) {
    Path current = directory;
    while (current != null && current.startsWith(root)) {
      if (renamesAccessors(current.resolve("lombok.config"))) {
        return true;
      }
      current = current.getParent();
    }
    return false;
  }

  private static boolean renamesAccessors(Path config) {
    if (!Files.isRegularFile(config)) {
      return false;
    }
    try {
      String text = Files.readString(config);
      return text.contains("lombok.accessors") || text.contains("lombok.getter");
    } catch (java.io.IOException unreadable) {
      return true;
    }
  }

  public static void apply(TypeInfo type, boolean allowed) {
    if (!type.unit.lombok) {
      return;
    }
    ModifiersTree modifiers = type.tree.getModifiers();
    boolean value = Names.hasAnnotation(modifiers, "Value");
    boolean data = Names.hasAnnotation(modifiers, "Data");
    type.lombokData = value || data;
    String defaults = annotationText(modifiers, "FieldDefaults");
    type.lombokPrivate = value || defaults.contains("PRIVATE");
    type.lombokFinal = value || defaults.replace(" ", "").contains("makeFinal=true");
    type.lombokReplaceable =
        !value && REPLACING.stream().anyMatch(name -> Names.hasAnnotation(modifiers, name));
    if (allowed && !Names.hasAnnotation(modifiers, "Accessors")) {
      addGetters(type, value || data || Names.hasAnnotation(modifiers, "Getter"));
    }
  }

  private static void addGetters(TypeInfo type, boolean wholeClass) {
    ModifiersTree classModifiers = type.tree.getModifiers();
    for (FieldInfo field : List.copyOf(type.fields)) {
      ModifiersTree own = field.tree.getModifiers();
      boolean annotated = Names.hasAnnotation(own, "Getter");
      if (field.isStatic || Names.hasAnnotation(own, "Accessors") || !(annotated || wholeClass)) {
        continue;
      }
      String level = annotated ? annotationText(own, "Getter") : annotationText(classModifiers, "Getter");
      Set<Modifier> flags = flagsFor(level);
      String name = getterName(field);
      if (flags != null && !declares(type, name)) {
        MethodInfo.Getter getter =
            new MethodInfo.Getter(name, field.tree.getType(), field.name, flags, type.unit.line(field.tree));
        type.methods.add(new MethodInfo(type, getter));
      }
    }
  }

  private static Set<Modifier> flagsFor(String level) {
    if (level.contains("NONE") || level.contains("PRIVATE") || level.contains("PACKAGE")) {
      return null;
    }
    return Set.of(level.contains("PROTECTED") ? Modifier.PROTECTED : Modifier.PUBLIC);
  }

  private static boolean declares(TypeInfo type, String name) {
    for (MethodInfo method : type.methods) {
      if (method.name.equals(name) && method.params.isEmpty()) {
        return true;
      }
    }
    return false;
  }

  public static String getterName(FieldInfo field) {
    String name = field.name;
    boolean primitive = field.tree.getType() != null && field.tree.getType().toString().equals("boolean");
    if (!primitive) {
      return "get" + Names.capitalize(name);
    }
    boolean prefixed = name.length() > 2 && name.startsWith("is") && Character.isUpperCase(name.charAt(2));
    return prefixed ? name : "is" + Names.capitalize(name);
  }

  private static String annotationText(ModifiersTree modifiers, String name) {
    for (AnnotationTree annotation : modifiers.getAnnotations()) {
      if (Names.annotationName(annotation).equals(name)) {
        return annotation.toString();
      }
    }
    return "";
  }
}
