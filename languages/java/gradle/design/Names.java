package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.util.*;

final class Names {
  private Names() {}

  static String typeText(Tree type) {
    if (type == null) {
      return null;
    }
    return switch (type) {
      case PrimitiveTypeTree primitive ->
          primitive.getPrimitiveTypeKind().name().toLowerCase(Locale.ROOT);
      case ParameterizedTypeTree parameterized -> typeText(parameterized.getType());
      case ArrayTypeTree array -> typeText(array.getType()) + "[]";
      case AnnotatedTypeTree annotated -> typeText(annotated.getUnderlyingType());
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

  static List<String> segments(Tree tree) {
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

  static Tree unparen(Tree tree) {
    Tree current = tree;
    while (current instanceof ParenthesizedTree parenthesized) {
      current = parenthesized.getExpression();
    }
    return current;
  }

  static Tree unwrap(Tree tree) {
    Tree current = unparen(tree);
    while (current instanceof TypeCastTree cast) {
      current = unparen(cast.getExpression());
    }
    return current;
  }

  static String capitalize(String name) {
    return name.isEmpty() ? name : Character.toUpperCase(name.charAt(0)) + name.substring(1);
  }

  static String compact(Tree tree) {
    return tree.toString().replaceAll("\\s+", "").replace("this.", "");
  }

  static boolean hasAnnotation(ModifiersTree modifiers, String simpleName) {
    for (AnnotationTree annotation : modifiers.getAnnotations()) {
      if (annotationName(annotation).equals(simpleName)) {
        return true;
      }
    }
    return false;
  }

  static String annotationName(AnnotationTree annotation) {
    List<String> parts = segments(annotation.getAnnotationType());
    return parts.isEmpty() ? "" : parts.get(parts.size() - 1);
  }
}
