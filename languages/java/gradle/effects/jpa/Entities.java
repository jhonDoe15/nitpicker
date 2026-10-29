package nitpicker.effects.jpa;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.classes.ClassIndex;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldNode;
import org.objectweb.asm.tree.MethodNode;

public final class Entities {
  public record Relation(String entity, String name, String target, boolean collection, boolean batched) {}

  private static final List<String> NAMESPACES = List.of("Ljakarta/persistence/", "Ljavax/persistence/");
  private static final List<String> TO_MANY = List.of("OneToMany", "ManyToMany");
  private static final List<String> TO_ONE = List.of("ManyToOne", "OneToOne");
  private static final String BATCH_SIZE = "Lorg/hibernate/annotations/BatchSize;";
  private static final String FETCH = "Lorg/hibernate/annotations/Fetch;";
  private final ClassIndex index;
  private final boolean defaultBatch;
  private final Map<String, Map<String, Relation>> relations = new HashMap<>();
  private final Map<String, Set<String>> identifiers = new HashMap<>();
  private final Map<String, Set<String>> graphs = new HashMap<>();
  private final Map<String, String> namedQueries = new HashMap<>();

  public Entities(ClassIndex index, boolean defaultBatch) {
    this.index = index;
    this.defaultBatch = defaultBatch;
    for (ClassNode node : index.projectClasses()) {
      if (persistent(node)) {
        read(node);
      }
    }
  }

  public Relation relation(String owner, String getter, String desc) {
    if (Type.getArgumentTypes(desc).length > 0) {
      return null;
    }
    for (String type : lineage(owner)) {
      Relation relation = relations.getOrDefault(type, Map.of()).get(getter);
      if (relation != null) {
        return relation;
      }
    }
    return null;
  }

  public boolean identifier(String owner, String getter) {
    for (String type : lineage(owner)) {
      if (identifiers.getOrDefault(type, Set.of()).contains(getter)) {
        return true;
      }
    }
    return false;
  }

  public Set<String> graph(String name) {
    return graphs.getOrDefault(name, Set.of());
  }

  public String namedQuery(String name) {
    return namedQueries.get(name);
  }

  private List<String> lineage(String owner) {
    List<String> types = new ArrayList<>(List.of(owner));
    types.addAll(index.ancestors(owner));
    return types;
  }

  private boolean persistent(ClassNode node) {
    return jpa("Entity", node.visibleAnnotations, node.invisibleAnnotations) != null
        || jpa("MappedSuperclass", node.visibleAnnotations, node.invisibleAnnotations) != null;
  }

  private static AnnotationNode jpa(String simple, List<AnnotationNode> visible, List<AnnotationNode> invisible) {
    for (String namespace : NAMESPACES) {
      AnnotationNode found = Annotations.find(namespace + simple + ";", visible, invisible);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  private void read(ClassNode node) {
    String simple = node.name.substring(node.name.lastIndexOf('/') + 1);
    for (FieldNode field : node.fields) {
      member(node.name, getter(field.name), field.name, Type.getType(field.desc), field.signature,
          Annotations.lists(field.visibleAnnotations, field.invisibleAnnotations));
    }
    for (MethodNode method : node.methods) {
      if (method.name.startsWith("get") && method.name.length() > 3) {
        String property = Character.toLowerCase(method.name.charAt(3)) + method.name.substring(4);
        member(node.name, method.name, property, Type.getReturnType(method.desc), method.signature,
            Annotations.lists(method.visibleAnnotations, method.invisibleAnnotations));
      }
    }
    for (List<AnnotationNode> list : Annotations.lists(node.visibleAnnotations, node.invisibleAnnotations)) {
      for (AnnotationNode annotation : list) {
        classAnnotation(annotation, simple);
      }
    }
  }

  private void member(String owner, String getter, String property, Type type, String signature,
      List<List<AnnotationNode>> annotations) {
    List<AnnotationNode> visible = annotations.isEmpty() ? null : annotations.get(0);
    List<AnnotationNode> invisible = annotations.size() > 1 ? annotations.get(1) : null;
    if (jpa("Id", visible, invisible) != null || jpa("EmbeddedId", visible, invisible) != null) {
      identifiers.computeIfAbsent(owner, key -> new LinkedHashSet<>()).add(getter);
    }
    for (String kind : List.of(TO_MANY, TO_ONE).stream().flatMap(List::stream).toList()) {
      AnnotationNode mapping = jpa(kind, visible, invisible);
      if (mapping == null) {
        continue;
      }
      boolean collection = TO_MANY.contains(kind);
      String fetch = Annotations.enumValue(mapping, "fetch");
      boolean lazy = collection ? !"EAGER".equals(fetch) : "LAZY".equals(fetch);
      if (!lazy) {
        return;
      }
      List<String> declared = Annotations.strings(mapping, "targetEntity");
      String target = !declared.isEmpty() && !declared.get(0).equals("void") ? declared.get(0)
          : collection ? elementType(signature) : type.getSort() == Type.OBJECT ? type.getInternalName() : null;
      AnnotationNode fetchMode = Annotations.find(FETCH, visible, invisible);
      boolean batched = defaultBatch || Annotations.find(BATCH_SIZE, visible, invisible) != null
          || "SUBSELECT".equals(Annotations.enumValue(fetchMode, "value"))
          || (target != null && index.annotated(target, BATCH_SIZE));
      relations.computeIfAbsent(owner, key -> new HashMap<>())
          .put(getter, new Relation(owner, property, target, collection, batched));
      return;
    }
  }

  private void classAnnotation(AnnotationNode annotation, String simple) {
    for (String namespace : NAMESPACES) {
      if (annotation.desc.equals(namespace + "NamedEntityGraph;")) {
        graph(annotation, simple);
      } else if (annotation.desc.equals(namespace + "NamedQuery;")) {
        namedQuery(annotation);
      } else if (annotation.desc.equals(namespace + "NamedEntityGraphs;")
          || annotation.desc.equals(namespace + "NamedQueries;")) {
        for (AnnotationNode inner : nested(annotation, "value")) {
          classAnnotation(inner, simple);
        }
      }
    }
  }

  private void graph(AnnotationNode annotation, String simple) {
    List<String> names = Annotations.strings(annotation, "name");
    Set<String> nodes = graphs.computeIfAbsent(names.isEmpty() ? simple : names.get(0), key -> new LinkedHashSet<>());
    for (AnnotationNode node : nested(annotation, "attributeNodes")) {
      nodes.addAll(Annotations.strings(node, "value"));
    }
  }

  private void namedQuery(AnnotationNode annotation) {
    List<String> names = Annotations.strings(annotation, "name");
    List<String> queries = Annotations.strings(annotation, "query");
    if (!names.isEmpty() && !queries.isEmpty()) {
      namedQueries.put(names.get(0), queries.get(0));
    }
  }

  private static List<AnnotationNode> nested(AnnotationNode annotation, String name) {
    Object value = Annotations.value(annotation, name);
    List<AnnotationNode> found = new ArrayList<>();
    if (value instanceof AnnotationNode single) {
      found.add(single);
    } else if (value instanceof List<?> list) {
      for (Object item : list) {
        if (item instanceof AnnotationNode node) {
          found.add(node);
        }
      }
    }
    return found;
  }

  private static String getter(String field) {
    return field.isEmpty() ? field : "get" + Character.toUpperCase(field.charAt(0)) + field.substring(1);
  }

  static String elementType(String signature) {
    if (signature == null || signature.indexOf('<') < 0) {
      return null;
    }
    String arguments = signature.substring(signature.indexOf('<') + 1, signature.lastIndexOf('>'));
    List<String> parts = new ArrayList<>();
    int depth = 0;
    int start = 0;
    for (int position = 0; position < arguments.length(); position++) {
      char current = arguments.charAt(position);
      depth += current == '<' ? 1 : current == '>' ? -1 : 0;
      if (current == ';' && depth == 0) {
        parts.add(arguments.substring(start, position + 1));
        start = position + 1;
      }
    }
    if (parts.isEmpty()) {
      return null;
    }
    String last = parts.get(parts.size() - 1).replaceFirst("^[+-]", "");
    if (!last.startsWith("L")) {
      return null;
    }
    int end = last.indexOf('<') >= 0 ? last.indexOf('<') : last.indexOf(';');
    return last.substring(1, end);
  }
}
