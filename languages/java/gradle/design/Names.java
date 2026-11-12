package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;

public final class Names {
  private Names() {}

  public static String typeText(Tree type) {
    return switch (type) {
      case null -> null;
      case PrimitiveTypeTree primitive ->
          primitive.getPrimitiveTypeKind().name().toLowerCase(Locale.ROOT);
      case ParameterizedTypeTree parameterized -> typeText(parameterized.getType());
      case ArrayTypeTree array -> typeText(array.getType()) + "[]";
      case AnnotatedTypeTree annotated -> typeText(annotated.getUnderlyingType());
      default -> nameText(type);
    };
  }

  private static String nameText(Tree type) {
    return switch (type) {
      case IdentifierTree identifier -> identifier.getName().toString();
      case MemberSelectTree select -> trimPackage(segments(select));
      case WildcardTree wildcard -> "?";
      default -> type.toString().replaceAll("\\s+", "");
    };
  }

  private static String trimPackage(List<String> segments) {
    int from = 0;
    while (from < segments.size() - 1 && Character.isLowerCase(segments.get(from).charAt(0))) {
      from++;
    }
    return String.join(".", segments.subList(from, segments.size()));
  }

  public static List<String> segments(Tree tree) {
    LinkedList<String> parts = new LinkedList<>();
    Tree current = tree;
    while (current instanceof MemberSelectTree select) {
      parts.addFirst(select.getIdentifier().toString());
      current = select.getExpression();
    }
    if (current instanceof IdentifierTree identifier) {
      parts.addFirst(identifier.getName().toString());
      return parts;
    }
    return List.of();
  }

  public static boolean isThis(Tree tree) {
    return tree instanceof IdentifierTree identifier && identifier.getName().contentEquals("this");
  }

  public static Tree unparen(Tree tree) {
    Tree current = tree;
    while (current instanceof ParenthesizedTree parenthesized) {
      current = parenthesized.getExpression();
    }
    return current;
  }

  public static Tree unwrap(Tree tree) {
    Tree current = unparen(tree);
    while (current instanceof TypeCastTree cast) {
      current = unparen(cast.getExpression());
    }
    return current;
  }

  public static String qualify(String pkg, String name) {
    return pkg.isEmpty() ? name : pkg + "." + name;
  }

  public static String capitalize(String name) {
    return name.isEmpty() ? name : Character.toUpperCase(name.charAt(0)) + name.substring(1);
  }

  public static String compact(Tree tree) {
    return tree.toString().replaceAll("\\s+", "").replace("this.", "");
  }

  public static boolean hasAnnotation(ModifiersTree modifiers, String simpleName) {
    for (AnnotationTree annotation : modifiers.getAnnotations()) {
      if (annotationName(annotation).equals(simpleName)) {
        return true;
      }
    }
    return false;
  }

  public static String annotationName(AnnotationTree annotation) {
    List<String> parts = segments(annotation.getAnnotationType());
    return parts.isEmpty() ? "" : parts.get(parts.size() - 1);
  }
}
