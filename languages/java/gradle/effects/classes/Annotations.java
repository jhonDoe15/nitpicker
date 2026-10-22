package nitpicker.effects.classes;

import java.util.ArrayList;
import java.util.List;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AnnotationNode;

public final class Annotations {
  private Annotations() {}

  @SafeVarargs
  public static List<List<AnnotationNode>> lists(List<AnnotationNode>... lists) {
    List<List<AnnotationNode>> present = new ArrayList<>();
    for (List<AnnotationNode> list : lists) {
      if (list != null) {
        present.add(list);
      }
    }
    return present;
  }

  public static AnnotationNode find(String desc, List<AnnotationNode> visible, List<AnnotationNode> invisible) {
    for (List<AnnotationNode> list : lists(visible, invisible)) {
      for (AnnotationNode annotation : list) {
        if (annotation.desc.equals(desc)) {
          return annotation;
        }
      }
    }
    return null;
  }

  public static AnnotationNode findAny(List<String> descs, List<AnnotationNode> visible,
      List<AnnotationNode> invisible) {
    for (String desc : descs) {
      AnnotationNode found = find(desc, visible, invisible);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  public static Object value(AnnotationNode annotation, String name) {
    if (annotation == null || annotation.values == null) {
      return null;
    }
    for (int index = 0; index + 1 < annotation.values.size(); index += 2) {
      if (name.equals(annotation.values.get(index))) {
        return annotation.values.get(index + 1);
      }
    }
    return null;
  }

  public static List<String> strings(AnnotationNode annotation, String name) {
    Object value = value(annotation, name);
    List<String> found = new ArrayList<>();
    if (value instanceof String text) {
      found.add(text);
    } else if (value instanceof List<?> list) {
      for (Object item : list) {
        if (item instanceof String text) {
          found.add(text);
        } else if (item instanceof Type type) {
          found.add(type.getInternalName());
        }
      }
    } else if (value instanceof Type type) {
      found.add(type.getInternalName());
    }
    return found;
  }

  public static String enumValue(AnnotationNode annotation, String name) {
    Object value = value(annotation, name);
    return value instanceof String[] pair && pair.length == 2 ? pair[1] : null;
  }
}
