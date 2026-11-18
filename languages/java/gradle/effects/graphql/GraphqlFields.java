package nitpicker.effects.graphql;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.Report;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.MethodInsnNode;

public final class GraphqlFields {
  public static final String RULE = "GraphqlFieldPerParent";
  private static final String SPRING = "Lorg/springframework/graphql/data/method/annotation/SchemaMapping;";
  private static final String DGS = "Lcom/netflix/graphql/dgs/DgsData;";
  private static final Set<String> ROOTS = Set.of("Query", "Mutation", "Subscription");
  private static final List<String> NOT_PARENTS = List.of("java/", "kotlin/", "graphql/", "org/dataloader/",
      "org/springframework/security/", "org/springframework/graphql/");
  private static final Set<String> NOT_PARENT_ANNOTATIONS = Set.of("Argument", "Arguments", "ContextValue",
      "LocalContextValue");
  private record Hit(Call call, Map<String, List<String>> kinds) {}

  private final Program program;
  private final Summaries summaries;
  private final Set<String> listTypes;
  private final Report report;

  public GraphqlFields(Program program, Summaries summaries, Set<String> listTypes, Report report) {
    this.program = program;
    this.summaries = summaries;
    this.listTypes = listTypes;
    this.report = report;
  }

  public void run() {
    Walker walker = new Walker(program, false);
    for (MethodFlow entry : program.entries()) {
      AnnotationNode spring = Annotations.find(SPRING, entry.method.visibleAnnotations,
          entry.method.invisibleAnnotations);
      AnnotationNode dgs = Annotations.find(DGS, entry.method.visibleAnnotations, entry.method.invisibleAnnotations);
      if (spring == null && dgs == null) {
        continue;
      }
      String parent = spring != null ? springParent(entry, spring) : text(dgs, "parentType");
      if (parent != null && ROOTS.contains(parent) || !perParent(parent)) {
        continue;
      }
      Hit[] first = new Hit[1];
      walker.walk(entry, Walker.Ctx.NONE, new Walker.Visitor() {
        @Override
        public void visit(MethodFlow flow, int index, MethodInsnNode call, Walker.Ctx ctx) {
          consider(first, new Call(flow, index, call.owner, call.name, call.desc));
        }

        @Override
        public void reference(MethodFlow flow, int index, String owner, String name, String desc, Walker.Ctx ctx) {
          consider(first, new Call(flow, index, owner, name, desc));
        }
      });
      if (first[0] != null) {
        report(entry, spring != null ? "spring" : "dgs", parent, first[0]);
      }
    }
  }

  private boolean perParent(String parent) {
    return listTypes != null && parent != null && listTypes.contains(parent);
  }

  private void consider(Hit[] first, Call call) {
    if (first[0] != null || call.owner().equals(call.flow().owner.name) && program.anonymous(call.owner())) {
      return;
    }
    Map<String, List<String>> kinds = summaries.at(call);
    if (kinds.containsKey(Kinds.DATABASE) || kinds.containsKey(Kinds.REMOTE)) {
      first[0] = new Hit(call, kinds);
    }
  }

  private void report(MethodFlow entry, String framework, String parent, Hit hit) {
    Call call = hit.call();
    Map<String, List<String>> kinds = hit.kinds();
    String kind = kinds.containsKey(Kinds.DATABASE) ? Kinds.DATABASE : Kinds.REMOTE;
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("framework", framework);
    extra.put("parent", parent == null ? "" : parent);
    extra.put("kind", kind);
    extra.put("path", kinds.get(kind));
    report.add(RULE, call.flow(), call.index(), Report.methodName(entry) + "|" + String.join(">", kinds.get(kind)),
        extra);
  }

  private String springParent(MethodFlow entry, AnnotationNode method) {
    String named = text(method, "typeName");
    if (named == null) {
      AnnotationNode owner = Annotations.find(SPRING, entry.owner.visibleAnnotations, entry.owner.invisibleAnnotations);
      named = owner == null ? null : text(owner, "typeName");
    }
    if (named != null) {
      return named;
    }
    Type[] arguments = Type.getArgumentTypes(entry.method.desc);
    for (int position = 0; position < arguments.length; position++) {
      String type = arguments[position].getSort() == Type.OBJECT ? arguments[position].getInternalName() : null;
      if (type != null && !marked(entry, position) && NOT_PARENTS.stream().noneMatch(type::startsWith)) {
        return type.substring(type.lastIndexOf('/') + 1).replace('$', '.');
      }
    }
    return null;
  }

  private static boolean marked(MethodFlow entry, int position) {
    return marked(entry.method.visibleParameterAnnotations, position)
        || marked(entry.method.invisibleParameterAnnotations, position);
  }

  private static boolean marked(List<AnnotationNode>[] lists, int position) {
    if (lists == null || position >= lists.length || lists[position] == null) {
      return false;
    }
    for (AnnotationNode annotation : lists[position]) {
      String name = annotation.desc.substring(annotation.desc.lastIndexOf('/') + 1).replace(";", "");
      if (NOT_PARENT_ANNOTATIONS.contains(name)) {
        return true;
      }
    }
    return false;
  }

  private static String text(AnnotationNode annotation, String name) {
    Object value = Annotations.value(annotation, name);
    return value instanceof String text && !text.isEmpty() ? text : null;
  }
}
