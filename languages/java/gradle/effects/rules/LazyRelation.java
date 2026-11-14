package nitpicker.effects.rules;

import java.util.ArrayList;
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
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Handle;
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
  private final Map<String, Map<Integer, List<Entities.Relation>>> touches = new HashMap<>();

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
    for (int round = 0; round < 3; round++) {
      flows.stream().filter(MethodFlow::analyzed).forEach(this::summarize);
    }
    for (MethodFlow flow : flows) {
      if (flow.analyzed()) {
        check(flow);
        helpers(flow);
      }
    }
  }

  private void summarize(MethodFlow flow) {
    String key = Program.key(flow.owner.name, flow.method.name, flow.method.desc);
    Origins origins = new Origins(flow);
    for (int index = 0; index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode call)) {
        continue;
      }
      Entities.Relation relation = call.getOpcode() == Opcodes.INVOKESTATIC ? null
          : entities.relation(call.owner, call.name, call.desc);
      if (relation != null && !relation.batched() && initialized(flow, origins, index, relation)) {
        touch(key, parameter(flow, origins, flow.receiver(index)), relation);
      }
      for (Map.Entry<Integer, List<Entities.Relation>> entry : touched(call.owner, call.name, call.desc).entrySet()) {
        int parameter = parameter(flow, origins, flow.argument(index, entry.getKey()));
        entry.getValue().forEach(found -> touch(key, parameter, found));
      }
    }
  }

  private void touch(String key, int parameter, Entities.Relation relation) {
    if (parameter < 0) {
      return;
    }
    List<Entities.Relation> known = touches.computeIfAbsent(key, ignored -> new HashMap<>())
        .computeIfAbsent(parameter, ignored -> new ArrayList<>());
    if (!known.contains(relation)) {
      known.add(relation);
    }
  }

  private Map<Integer, List<Entities.Relation>> touched(String owner, String name, String desc) {
    String declaration = program.index.isProject(owner) ? program.declaration(owner, name, desc) : null;
    return declaration == null ? Map.of() : touches.getOrDefault(declaration, Map.of());
  }

  private static int parameter(MethodFlow flow, Origins origins, SourceValue value) {
    if (value == null) {
      return -1;
    }
    Set<Integer> slots = origins.identity(value).parameters();
    int count = Type.getArgumentTypes(flow.method.desc).length;
    for (int position = 0; position < count; position++) {
      if (slots.contains(flow.parameterSlot(position))) {
        return position;
      }
    }
    return -1;
  }

  private void helpers(MethodFlow flow) {
    Origins origins = new Origins(flow);
    for (int index = 0; index < flow.insns.length; index++) {
      if (flow.insns[index] instanceof MethodInsnNode call) {
        for (Map.Entry<Integer, List<Entities.Relation>> entry : touched(call.owner, call.name, call.desc)
            .entrySet()) {
          Queries.Origin origin = element(flow, origins, flow.argument(index, entry.getKey()));
          report(flow, index, origin, entry.getValue(), call);
        }
      }
    }
    for (Lambdas.Use use : program.lambdas(flow)) {
      Handle handle = use.reference();
      boolean unbound = handle != null && handle.getTag() != Opcodes.H_INVOKESTATIC && use.captured() == 0;
      if (handle == null || unbound || use.consumer() < 0
          || !walker.iterating((MethodInsnNode) flow.insns[use.consumer()])) {
        continue;
      }
      List<Entities.Relation> relations = touched(handle.getOwner(), handle.getName(), handle.getDesc()).get(0);
      if (relations != null) {
        Queries.Origin origin = source(flow, origins, receiverOf(flow, use.consumer()), 0);
        MethodInsnNode via = new MethodInsnNode(Opcodes.INVOKEVIRTUAL, handle.getOwner(), handle.getName(),
            handle.getDesc());
        report(flow, use.index(), origin, relations, via);
      }
    }
  }

  private void report(MethodFlow flow, int index, Queries.Origin origin, List<Entities.Relation> relations,
      MethodInsnNode via) {
    Entities.Relation relation = origin == null ? null : relations.stream()
        .filter(candidate -> !origin.fetched().contains(candidate.name())).findFirst().orElse(null);
    if (relation == null) {
      return;
    }
    String entity = simple(relation.entity());
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("entity", entity);
    extra.put("relation", relation.name());
    extra.put("collection", relation.collection());
    extra.put("origin", origin.label());
    if (via != null) {
      extra.put("via", Summaries.label(via.owner, via.name, via.desc));
    }
    report.add(RULE, flow, index, Report.methodName(flow) + "|" + entity + "." + relation.name(), extra);
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
      report(flow, index, element(flow, origins, flow.receiver(index)), List.of(relation), null);
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
    if (value == null) {
      return null;
    }
    Origins.Identity identity = origins.identity(value);
    for (int terminal : identity.terminals()) {
      if (!(flow.insns[terminal] instanceof MethodInsnNode call)
          || program.loops(flow).stream().noneMatch(loop -> loop.contains(terminal))) {
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
