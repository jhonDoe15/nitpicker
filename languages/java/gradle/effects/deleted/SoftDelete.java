package nitpicker.effects.deleted;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.classes.ClassIndex;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldNode;

public final class SoftDelete {
  public record Flag(String property, String column) {
    public boolean mentionedIn(String text) {
      String lower = text.toLowerCase();
      String bare = property.replaceFirst("^is(?=[A-Z])", "").toLowerCase();
      return lower.contains(bare) || lower.contains(column.toLowerCase());
    }
  }

  private static final Set<String> NAMES = Set.of("deleted", "deletedat", "isdeleted", "archived", "archivedat",
      "isarchived", "hidden", "ishidden", "visibility", "isvisible", "trashedat", "removedat");
  private static final List<String> PERSISTENT = List.of("Ljakarta/persistence/Entity;",
      "Ljavax/persistence/Entity;", "Ljakarta/persistence/MappedSuperclass;", "Ljavax/persistence/MappedSuperclass;");
  private static final List<String> RESTRICTIONS = List.of("Lorg/hibernate/annotations/SQLRestriction;",
      "Lorg/hibernate/annotations/Where;", "Lorg/hibernate/annotations/FilterDef;",
      "Lorg/hibernate/annotations/SoftDelete;");
  private static final List<String> COLUMNS = List.of("Ljakarta/persistence/Column;", "Ljavax/persistence/Column;");
  private static final List<String> TABLES = List.of("Ljakarta/persistence/Table;", "Ljavax/persistence/Table;");
  private final ClassIndex index;
  private final Map<String, List<Flag>> flags = new HashMap<>();
  private final Map<String, String> tables = new HashMap<>();

  public SoftDelete(ClassIndex index) {
    this.index = index;
    for (ClassNode node : index.projectClasses()) {
      if (!index.isExternal(node.name) && persistent(node) && entity(node)) {
        List<Flag> found = flagsOf(node);
        if (!found.isEmpty() && !restricted(node)) {
          flags.put(node.name, found);
        }
        tables.put(node.name, table(node));
      }
    }
  }

  public Map<String, List<Flag>> flags() {
    return flags;
  }

  public List<Flag> of(String entity) {
    return flags.getOrDefault(entity, List.of());
  }

  public String table(String entity) {
    return tables.getOrDefault(entity, snake(simple(entity)));
  }

  public static String simple(String type) {
    return type.substring(type.lastIndexOf('/') + 1).replace('$', '.');
  }

  private static boolean persistent(ClassNode node) {
    return Annotations.findAny(PERSISTENT, node.visibleAnnotations, node.invisibleAnnotations) != null;
  }

  private static boolean entity(ClassNode node) {
    return Annotations.findAny(PERSISTENT.subList(0, 2), node.visibleAnnotations, node.invisibleAnnotations) != null;
  }

  private boolean restricted(ClassNode node) {
    List<String> types = new ArrayList<>(List.of(node.name));
    types.addAll(index.ancestors(node.name));
    for (String type : types) {
      ClassNode parent = index.node(type);
      if (parent != null
          && Annotations.findAny(RESTRICTIONS, parent.visibleAnnotations, parent.invisibleAnnotations) != null) {
        return true;
      }
    }
    return false;
  }

  private List<Flag> flagsOf(ClassNode node) {
    List<Flag> found = new ArrayList<>();
    List<String> types = new ArrayList<>(List.of(node.name));
    types.addAll(index.ancestors(node.name));
    for (String type : types) {
      ClassNode parent = index.node(type);
      for (FieldNode field : parent == null ? List.<FieldNode>of() : parent.fields) {
        AnnotationNode column = Annotations.findAny(COLUMNS, field.visibleAnnotations, field.invisibleAnnotations);
        List<String> names = Annotations.strings(column, "name");
        String declared = names.isEmpty() ? snake(field.name) : names.get(0);
        boolean flagged = NAMES.contains(normal(field.name)) || NAMES.contains(normal(declared));
        if (flagged && !field.desc.contains("Collection")) {
          found.add(new Flag(field.name, declared));
        }
      }
    }
    return found;
  }

  private static AnnotationNode tableOf(ClassNode node) {
    return Annotations.findAny(TABLES, node.visibleAnnotations, node.invisibleAnnotations);
  }

  private static String table(ClassNode node) {
    List<String> names = Annotations.strings(tableOf(node), "name");
    return names.isEmpty() ? snake(simple(node.name)) : names.get(0);
  }

  private static String normal(String name) {
    return name.replace("_", "").toLowerCase();
  }

  static String snake(String name) {
    return name.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase();
  }
}
