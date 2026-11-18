package nitpicker.effects.classes;

import java.util.List;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodNode;

public final class Beans {
  private static final List<String> STEREOTYPES = List.of("Lorg/springframework/stereotype/Component;",
      "Lorg/springframework/stereotype/Service;", "Lorg/springframework/stereotype/Repository;",
      "Lorg/springframework/stereotype/Controller;", "Lorg/springframework/web/bind/annotation/RestController;");

  private Beans() {}

  public static boolean stereotype(ClassIndex index, ClassNode node) {
    for (List<AnnotationNode> list : Annotations.lists(node.visibleAnnotations, node.invisibleAnnotations)) {
      for (AnnotationNode annotation : list) {
        if (STEREOTYPES.contains(annotation.desc) || composed(index, annotation.desc)) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean composed(ClassIndex index, String desc) {
    String type = desc.substring(1, desc.length() - 1);
    return STEREOTYPES.stream().anyMatch(stereotype -> index.header(type).annotations().contains(stereotype));
  }

  public static AnnotationNode onMethodOrClass(ClassNode owner, MethodNode method, List<String> descs) {
    AnnotationNode found = Annotations.findAny(descs, method.visibleAnnotations, method.invisibleAnnotations);
    return found != null ? found : Annotations.findAny(descs, owner.visibleAnnotations, owner.invisibleAnnotations);
  }
}
