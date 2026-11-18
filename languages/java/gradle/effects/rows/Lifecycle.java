package nitpicker.effects.rows;

import java.util.ArrayList;
import java.util.List;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldNode;
import org.objectweb.asm.tree.MethodNode;

public final class Lifecycle {
  private static final List<String> NAMESPACES = List.of("Ljakarta/persistence/", "Ljavax/persistence/");
  private static final List<String> FIELDS = List.of("Version");
  private static final List<String> METHODS = List.of("PreUpdate", "PostUpdate", "PreRemove", "PostRemove");
  private static final List<String> SPRING = List.of("Lorg/springframework/data/annotation/LastModifiedDate;",
      "Lorg/springframework/data/annotation/LastModifiedBy;", "Lorg/springframework/data/annotation/Version;",
      "Lorg/springframework/data/domain/DomainEvents;");
  private static final List<String> REMOVAL = List.of("Lorg/hibernate/annotations/SQLDelete;",
      "Lorg/hibernate/annotations/SoftDelete;", "Lorg/hibernate/annotations/SQLUpdate;");
  private static final List<String> COLLECTIONS = List.of("ElementCollection", "ManyToMany", "JoinTable",
      "CollectionTable");
  private static final String AUDITED = "Lorg/hibernate/envers/Audited;";
  private static final String AGGREGATE = "org/springframework/data/domain/AbstractAggregateRoot";
  private final Program program;

  public Lifecycle(Program program) {
    this.program = program;
  }

  public boolean skipsBulk(ClassNode entity, boolean removal) {
    List<String> types = new ArrayList<>(List.of(entity.name));
    types.addAll(program.index.ancestors(entity.name));
    for (String type : types) {
      ClassNode node = program.index.library(type);
      if (node != null && declares(node, removal)) {
        return true;
      }
    }
    return program.index.isSubtype(entity.name, AGGREGATE);
  }

  private static boolean declares(ClassNode node, boolean removal) {
    if (named(node.visibleAnnotations, node.invisibleAnnotations, List.of("EntityListeners"))
        || Annotations.find(AUDITED, node.visibleAnnotations, node.invisibleAnnotations) != null
        || (removal && Annotations.findAny(REMOVAL, node.visibleAnnotations, node.invisibleAnnotations) != null)) {
      return true;
    }
    for (FieldNode field : node.fields) {
      if (Annotations.find(AUDITED, field.visibleAnnotations, field.invisibleAnnotations) != null
          || removal && named(field.visibleAnnotations, field.invisibleAnnotations, COLLECTIONS)
          || named(field.visibleAnnotations, field.invisibleAnnotations, FIELDS) || spring(field.visibleAnnotations,
          field.invisibleAnnotations) || cascades(field.visibleAnnotations, field.invisibleAnnotations)) {
        return true;
      }
    }
    for (MethodNode method : node.methods) {
      if (named(method.visibleAnnotations, method.invisibleAnnotations, METHODS)
          || spring(method.visibleAnnotations, method.invisibleAnnotations)
          || cascades(method.visibleAnnotations, method.invisibleAnnotations)) {
        return true;
      }
    }
    return false;
  }

  private static boolean named(List<AnnotationNode> visible, List<AnnotationNode> invisible, List<String> names) {
    for (String namespace : NAMESPACES) {
      for (String name : names) {
        if (Annotations.find(namespace + name + ";", visible, invisible) != null) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean spring(List<AnnotationNode> visible, List<AnnotationNode> invisible) {
    return Annotations.findAny(SPRING, visible, invisible) != null;
  }

  private static boolean cascades(List<AnnotationNode> visible, List<AnnotationNode> invisible) {
    for (List<AnnotationNode> list : Annotations.lists(visible, invisible)) {
      for (AnnotationNode annotation : list) {
        Object cascade = Annotations.value(annotation, "cascade");
        if (cascade instanceof List<?> values && !values.isEmpty()) {
          return true;
        }
      }
    }
    return false;
  }
}
