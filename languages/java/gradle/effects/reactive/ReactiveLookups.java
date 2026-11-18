package nitpicker.effects.reactive;

import java.util.ArrayList;
import java.util.Arrays;
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
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.InvokeDynamicInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class ReactiveLookups {
  public static final String RULE = "ReactiveLookupPerElement";
  private static final String FLUX = "reactor/core/publisher/Flux";
  private static final Set<String> SOURCES = Set.of("fromIterable", "fromStream", "fromArray");
  private static final Set<String> PER_ELEMENT = Set.of("map", "flatMap", "flatMapSequential", "concatMap");
  private static final Set<String> BATCHING = Set.of("buffer", "bufferTimeout", "bufferUntil", "bufferWhile", "window",
      "windowTimeout", "windowUntil", "windowWhile", "groupBy", "collectList", "collectMap");
  private static final int DEPTH = 10;
  private final Program program;
  private final Summaries summaries;
  private final Report report;

  public ReactiveLookups(Program program, Summaries summaries, Report report) {
    this.program = program;
    this.summaries = summaries;
    this.report = report;
  }

  public void run() {
    Walker walker = new Walker(program, false);
    for (MethodFlow flow : program.all()) {
      if (flow.external || !flow.analyzed()) {
        continue;
      }
      Origins origins = new Origins(flow);
      for (Lambdas.Use use : program.lambdas(flow)) {
        int consumer = use.consumer() >= 0 ? use.consumer() : adapted(flow, origins, use.index());
        if (consumer >= 0 && operator(flow, consumer)) {
          check(walker, flow, use, consumer);
        }
      }
    }
  }

  private int adapted(MethodFlow flow, Origins origins, int created) {
    for (int adapter = created + 1; adapter < flow.insns.length; adapter++) {
      if (flow.insns[adapter] instanceof InvokeDynamicInsnNode
          && takes(flow, origins, adapter, created)) {
        for (int call = adapter + 1; call < flow.insns.length; call++) {
          if (flow.insns[call] instanceof MethodInsnNode && takes(flow, origins, call, adapter)) {
            return call;
          }
        }
      }
    }
    return -1;
  }

  private static boolean takes(MethodFlow flow, Origins origins, int consumer, int created) {
    for (SourceValue operand : flow.operands(consumer)) {
      if (origins.identity(operand).terminals().contains(created)) {
        return true;
      }
    }
    return false;
  }

  private boolean operator(MethodFlow flow, int index) {
    MethodInsnNode call = (MethodInsnNode) flow.insns[index];
    return PER_ELEMENT.contains(call.name) && program.index.isSubtype(call.owner, FLUX) && inMemory(flow, index);
  }

  private boolean inMemory(MethodFlow flow, int index) {
    Origins origins = new Origins(flow);
    List<Integer> pending = new ArrayList<>(origins.identity(flow.receiver(index)).terminals());
    for (int step = 0; step < DEPTH && !pending.isEmpty(); step++) {
      List<Integer> next = new ArrayList<>();
      for (int at : pending) {
        if (!(flow.insns[at] instanceof MethodInsnNode call) || BATCHING.contains(call.name)) {
          continue;
        }
        if (source(call)) {
          return true;
        }
        boolean instance = call.getOpcode() != Opcodes.INVOKESTATIC;
        boolean flux = Type.getReturnType(call.desc).getSort() == Type.OBJECT
            && program.index.isSubtype(Type.getReturnType(call.desc).getInternalName(), FLUX);
        if (instance && flux && program.index.isSubtype(call.owner, FLUX) && flow.receiver(at) != null) {
          next.addAll(origins.identity(flow.receiver(at)).terminals());
        }
      }
      pending = next;
    }
    return false;
  }

  private static boolean source(MethodInsnNode call) {
    boolean flux = call.owner.equals(FLUX) && SOURCES.contains(call.name);
    boolean kotlin = call.name.equals("toFlux") && call.owner.startsWith("reactor/kotlin/");
    return flux || kotlin;
  }

  private void check(Walker walker, MethodFlow flow, Lambdas.Use use, int consumer) {
    List<Call> calls = new ArrayList<>();
    if (use.reference() != null) {
      calls.add(new Call(flow, use.index(), use.reference().getOwner(), use.reference().getName(),
          use.reference().getDesc()));
    }
    for (MethodFlow body : use.bodies()) {
      walker.walk(body, Walker.Ctx.NONE, new Walker.Visitor() {
        @Override
        public void visit(MethodFlow at, int index, MethodInsnNode call, Walker.Ctx ctx) {
          calls.add(new Call(at, index, call.owner, call.name, call.desc));
        }

        @Override
        public void reference(MethodFlow at, int index, String owner, String name, String desc, Walker.Ctx ctx) {
          calls.add(new Call(at, index, owner, name, desc));
        }
      });
    }
    boolean limited = Arrays.stream(Type.getArgumentTypes(((MethodInsnNode) flow.insns[consumer]).desc))
        .anyMatch(type -> type.getSort() == Type.INT);
    for (Call call : calls) {
      if (call.owner().equals(call.flow().owner.name) && program.anonymous(call.owner())) {
        continue;
      }
      Map<String, List<String>> kinds = summaries.at(call);
      String kind = kinds.containsKey(Kinds.DATABASE) ? Kinds.DATABASE
          : kinds.containsKey(Kinds.REMOTE) ? Kinds.REMOTE : null;
      if (kind != null && !(limited && kind.equals(Kinds.REMOTE))) {
        report(flow, consumer, kind, kinds.get(kind), limited);
        return;
      }
    }
  }

  private void report(MethodFlow flow, int index, String kind, List<String> path, boolean limited) {
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("kind", kind);
    extra.put("limited", limited);
    extra.put("path", path);
    report.add(RULE, flow, index, Report.methodName(flow) + "|" + String.join(">", path), extra);
  }
}
