package nitpicker.effects.jpa;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

public final class Queries {
  public record Origin(String label, Set<String> fetched) {}

  private static final Pattern QUERY_METHOD = Pattern.compile("(find|read|get|query|search|stream)[A-Z]?\\w*");
  private static final Pattern JOIN_FETCH = Pattern.compile("(?i)\\bjoin\\s+fetch\\s+\\w+\\.(\\w+)");
  private static final List<String> RESULTS = List.of("java/lang/Iterable", "java/util/stream/BaseStream");
  private static final List<String> JPA_QUERIES = List.of("jakarta/persistence/Query", "javax/persistence/Query");
  private static final List<String> MANAGERS =
      List.of("jakarta/persistence/EntityManager", "javax/persistence/EntityManager");
  private static final Set<String> QUERY_STEPS = Set.of("setParameter", "setMaxResults", "setFirstResult",
      "setFlushMode", "setLockMode", "setTimeout", "setCacheable", "setReadOnly");
  private static final String ENTITY_GRAPH = "Lorg/springframework/data/jpa/repository/EntityGraph;";
  private static final String QUERY = "Lorg/springframework/data/jpa/repository/Query;";
  private final Program program;
  private final Entities entities;

  public Queries(Program program, Entities entities) {
    this.program = program;
    this.entities = entities;
  }

  public Origin origin(MethodFlow flow, int index) {
    if (!(flow.insns[index] instanceof MethodInsnNode call)) {
      return null;
    }
    Type result = Type.getReturnType(call.desc);
    if (result.getSort() != Type.OBJECT || !program.index.isSubtypeOfAny(result.getInternalName(), RESULTS)) {
      return null;
    }
    if (program.kinds.isRepository(call.owner) && QUERY_METHOD.matcher(call.name).matches()) {
      return new Origin(Summaries.label(call.owner, call.name, call.desc), repositoryPlan(call));
    }
    boolean results = call.name.equals("getResultList") || call.name.equals("getResultStream");
    return results && program.index.isSubtypeOfAny(call.owner, JPA_QUERIES) ? jpql(flow, index, call, 0) : null;
  }

  private Set<String> repositoryPlan(MethodInsnNode call) {
    Set<String> fetched = new LinkedHashSet<>();
    List<String> types = new ArrayList<>(List.of(call.owner));
    types.addAll(program.index.ancestors(call.owner));
    String arguments = call.desc.substring(0, call.desc.indexOf(')') + 1);
    for (String type : types) {
      if (!program.index.isProject(type)) {
        continue;
      }
      for (MethodNode method : program.index.node(type).methods) {
        if (method.name.equals(call.name) && method.desc.startsWith(arguments)) {
          plan(method, fetched);
        }
      }
    }
    return fetched;
  }

  private void plan(MethodNode method, Set<String> fetched) {
    AnnotationNode graph = Annotations.find(ENTITY_GRAPH, method.visibleAnnotations, method.invisibleAnnotations);
    for (String path : Annotations.strings(graph, "attributePaths")) {
      fetched.add(path.split("\\.")[0]);
    }
    for (String name : Annotations.strings(graph, "value")) {
      fetched.addAll(entities.graph(name));
    }
    AnnotationNode query = Annotations.find(QUERY, method.visibleAnnotations, method.invisibleAnnotations);
    for (String text : Annotations.strings(query, "value")) {
      fetched.addAll(joinFetched(text));
    }
  }

  private Origin jpql(MethodFlow flow, int index, MethodInsnNode results, int depth) {
    if (depth > 12 || !flow.analyzed()) {
      return null;
    }
    Origins origins = new Origins(flow);
    for (int source : origins.identity(flow.receiver(index)).terminals()) {
      if (!(flow.insns[source] instanceof MethodInsnNode call)) {
        continue;
      }
      if (QUERY_STEPS.contains(call.name) && program.index.isSubtypeOfAny(call.owner, JPA_QUERIES)) {
        return jpql(flow, source, results, depth + 1);
      }
      if (!program.index.isSubtypeOfAny(call.owner, MANAGERS)) {
        continue;
      }
      String text = constant(flow, origins, source);
      String label = Summaries.label(results.owner, results.name, results.desc);
      if (call.name.equals("createQuery") && text != null) {
        return new Origin(label, joinFetched(text));
      }
      if (call.name.equals("createNamedQuery") && text != null && entities.namedQuery(text) != null) {
        return new Origin(label, joinFetched(entities.namedQuery(text)));
      }
      if (call.name.equals("createNativeQuery")) {
        return new Origin(label, Set.of());
      }
    }
    return null;
  }

  private static String constant(MethodFlow flow, Origins origins, int call) {
    for (int source : origins.identity(flow.argument(call, 0)).terminals()) {
      if (flow.insns[source] instanceof LdcInsnNode ldc && ldc.cst instanceof String text) {
        return text;
      }
    }
    return null;
  }

  private static Set<String> joinFetched(String text) {
    Set<String> fetched = new LinkedHashSet<>();
    Matcher matcher = JOIN_FETCH.matcher(text);
    while (matcher.find()) {
      fetched.add(matcher.group(1));
    }
    return fetched;
  }
}
