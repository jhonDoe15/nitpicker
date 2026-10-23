package nitpicker.effects.rules;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.Report;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.jpa.Entities;
import nitpicker.effects.jpa.Queries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class LazyRelation {
  public static final String RULE = "LazyRelationInLoop";
  private record Outer(MethodFlow flow, Lambdas.Use use) {}

  private static final Set<String> KEEPING = Set.of("stream", "parallelStream", "filter", "sorted", "distinct",
      "limit", "skip", "peek", "toList", "getContent", "asSequence", "asIterable", "unmodifiableList",
      "takeWhile", "dropWhile");
  private static final int DEPTH = 12;
  private final Program program;
  private final Entities entities;
  private final Queries queries;
  private final Walker walker;
  private final Report report;
  private final Map<MethodFlow, Outer> outers = new HashMap<>();

  public LazyRelation(Program program, Entities entities, Report report) {
    this.program = program;
    this.entities = entities;
    this.queries = new Queries(program, entities);
    this.walker = new Walker(program, false);
    this.report = report;
  }

  public void run() {
    List<MethodFlow> flows = program.all();
    for (MethodFlow flow : flows) {
      for (Lambdas.Use use : program.lambdas(flow)) {
        for (MethodFlow body : use.bodies()) {
          outers.putIfAbsent(body, new Outer(flow, use));
        }
      }
    }
    for (MethodFlow flow : flows) {
      if (flow.analyzed()) {
        check(flow);
      }
    }
  }

  private void check(MethodFlow flow) {
    Origins origins = null;
    for (int index = 0; index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode call) || call.getOpcode() == Opcodes.INVOKESTATIC) {
        continue;
      }
      Entities.Relation relation = entities.relation(call.owner, call.name, call.desc);
      if (relation == null || relation.batched()) {
        continue;
      }
      origins = origins == null ? new Origins(flow) : origins;
      if (!initialized(flow, origins, index, relation)) {
        continue;
      }
      Queries.Origin origin = element(flow, origins, flow.receiver(index));
      if (origin != null && !origin.fetched().contains(relation.name())) {
        String entity = simple(relation.entity());
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("entity", entity);
        extra.put("relation", relation.name());
        extra.put("collection", relation.collection());
        extra.put("origin", origin.label());
        report.add(RULE, flow, index, Report.methodName(flow) + "|" + entity + "." + relation.name(), extra);
      }
    }
  }

  private boolean initialized(MethodFlow flow, Origins origins, int getter, Entities.Relation relation) {
    for (int index = getter + 1; index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode call) || call.name.equals("<init>")) {
        continue;
      }
      boolean statical = call.getOpcode() == Opcodes.INVOKESTATIC;
      if (statical && !call.owner.startsWith("kotlin/collections/")) {
        continue;
      }
      SourceValue value = statical ? flow.argument(index, 0) : flow.receiver(index);
      if (value == null || !origins.identity(value).terminals().contains(getter)) {
        continue;
      }
      boolean identifier = !relation.collection() && relation.target() != null
          && entities.identifier(relation.target(), call.name);
      if (!identifier) {
        return true;
      }
    }
    return false;
  }

  private Queries.Origin element(MethodFlow flow, Origins origins, SourceValue value) {
    Origins.Identity identity = origins.identity(value);
    for (int terminal : identity.terminals()) {
      if (!(flow.insns[terminal] instanceof MethodInsnNode call)) {
        continue;
      }
      boolean next = call.name.equals("next") && program.index.isSubtype(call.owner, "java/util/Iterator");
      boolean get = call.name.equals("get") && program.index.isSubtype(call.owner, "java/util/List");
      if (next) {
        Queries.Origin origin = iterated(flow, origins, flow.receiver(terminal));
        if (origin != null) {
          return origin;
        }
      } else if (get) {
        Queries.Origin origin = source(flow, origins, flow.receiver(terminal), 0);
        if (origin != null) {
          return origin;
        }
      }
    }
    Outer outer = outers.get(flow);
    int parameters = Type.getArgumentTypes(flow.method.desc).length;
    if (outer == null || parameters == 0 || !identity.parameters().contains(flow.parameterSlot(parameters - 1))) {
      return null;
    }
    return callback(outer);
  }

  private Queries.Origin iterated(MethodFlow flow, Origins origins, SourceValue iterator) {
    for (int terminal : origins.identity(iterator).terminals()) {
      if (flow.insns[terminal] instanceof MethodInsnNode call && call.name.equals("iterator")) {
        Queries.Origin origin = source(flow, origins, receiverOf(flow, terminal), 0);
        if (origin != null) {
          return origin;
        }
      }
    }
    return null;
  }

  private Queries.Origin callback(Outer outer) {
    MethodFlow flow = outer.flow();
    int consumer = outer.use().consumer();
    if (consumer < 0 || !flow.analyzed() || !walker.iterating((MethodInsnNode) flow.insns[consumer])) {
      return null;
    }
    return source(flow, new Origins(flow), receiverOf(flow, consumer), 0);
  }

  private Queries.Origin source(MethodFlow flow, Origins origins, SourceValue value, int depth) {
    if (value == null || depth > DEPTH) {
      return null;
    }
    for (int terminal : origins.identity(value).terminals()) {
      Queries.Origin origin = queries.origin(flow, terminal);
      if (origin != null) {
        return origin;
      }
      if (flow.insns[terminal] instanceof MethodInsnNode call && KEEPING.contains(call.name)) {
        origin = source(flow, origins, receiverOf(flow, terminal), depth + 1);
        if (origin != null) {
          return origin;
        }
      }
    }
    return null;
  }

  private static SourceValue receiverOf(MethodFlow flow, int index) {
    return flow.insns[index].getOpcode() == Opcodes.INVOKESTATIC ? flow.argument(index, 0) : flow.receiver(index);
  }

  private static String simple(String type) {
    return type.substring(type.lastIndexOf('/') + 1).replace('$', '.');
  }
}
