package nitpicker.effects.jobs;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import nitpicker.effects.Report;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import nitpicker.effects.flow.Walker;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

public final class JobLoops {
  public static final String RULE = "JobLoopWithoutItemIsolation";
  private static final List<String> SCHEDULED = List.of("Lorg/springframework/scheduling/annotation/Scheduled;",
      "Lorg/springframework/scheduling/annotation/Schedules;");
  private static final List<String> KAFKA = List.of("Lorg/springframework/kafka/annotation/KafkaListener;");
  private static final List<String> SQS = List.of("Lio/awspring/cloud/sqs/annotation/SqsListener;");
  private static final List<String> BATCHES = List.of("java/util/Collection",
      "org/apache/kafka/clients/consumer/ConsumerRecords");
  private static final int HELPERS = 12;
  private final Program program;
  private final Summaries summaries;
  private final Isolation isolation;
  private final Report report;

  public JobLoops(Program program, Summaries summaries, Report report) {
    this.program = program;
    this.summaries = summaries;
    this.isolation = new Isolation(program, summaries);
    this.report = report;
  }

  public void run() {
    Walker walker = new Walker(program, true);
    for (MethodFlow entry : program.entries()) {
      String job = job(entry);
      if (job == null) {
        continue;
      }
      for (MethodFlow flow : withHelpers(entry)) {
        if (!flow.analyzed() || check(walker, entry, flow, job)) {
          break;
        }
      }
    }
  }

  private boolean check(Walker walker, MethodFlow entry, MethodFlow flow, String job) {
    boolean[] reported = {false};
    walker.walk(flow, Walker.Ctx.NONE, new Walker.Visitor() {
      @Override
      public void visit(MethodFlow at, int index, MethodInsnNode call, Walker.Ctx ctx) {
        if (!reported[0] && ctx.element() && !ctx.concurrent() && !ctx.later()) {
          reported[0] = unprotected(entry, at, index, call, job);
        }
      }
    });
    return reported[0];
  }

  private boolean unprotected(MethodFlow entry, MethodFlow at, int index, MethodInsnNode call, String job) {
    if (call.owner.equals(at.owner.name) && program.anonymous(call.owner)) {
      return false;
    }
    Map<String, List<String>> kinds = summaries.at(new Call(at, index, call.owner, call.name, call.desc));
    String kind = kinds.containsKey(Kinds.DATABASE) ? Kinds.DATABASE
        : kinds.containsKey(Kinds.REMOTE) ? Kinds.REMOTE : null;
    boolean helper = program.kinds.direct(call.owner, call.name, call.desc) == null;
    boolean swallowed = helper && isolation.swallows(call.owner, call.name, call.desc);
    if (kind == null || isolation.isolated(at, index) || swallowed) {
      return false;
    }
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("job", job);
    extra.put("kind", kind);
    extra.put("path", kinds.get(kind));
    report.add(RULE, at, index, Report.methodName(entry) + "|" + String.join(">", kinds.get(kind)), extra);
    return true;
  }

  private String job(MethodFlow flow) {
    MethodNode method = flow.method;
    if (Annotations.findAny(SCHEDULED, method.visibleAnnotations, method.invisibleAnnotations) != null) {
      return "@Scheduled";
    }
    if (Annotations.findAny(SQS, method.visibleAnnotations, method.invisibleAnnotations) != null) {
      return "@SqsListener";
    }
    boolean listener = Annotations.findAny(KAFKA, method.visibleAnnotations, method.invisibleAnnotations) != null;
    if (listener && batch(method)) {
      return "@KafkaListener";
    }
    boolean quartz = method.name.equals("execute") && method.desc.equals("(Lorg/quartz/JobExecutionContext;)V")
        && program.index.isSubtype(flow.owner.name, "org/quartz/Job");
    return quartz ? "Quartz Job" : null;
  }

  private boolean batch(MethodNode method) {
    for (Type argument : Type.getArgumentTypes(method.desc)) {
      if (argument.getSort() == Type.OBJECT && program.index.isSubtypeOfAny(argument.getInternalName(), BATCHES)) {
        return true;
      }
    }
    return false;
  }

  private List<MethodFlow> withHelpers(MethodFlow entry) {
    List<MethodFlow> found = new ArrayList<>(List.of(entry));
    for (int position = 0; position < found.size() && found.size() <= HELPERS; position++) {
      MethodFlow caller = found.get(position);
      for (AbstractInsnNode insn : caller.insns) {
        MethodFlow helper = insn instanceof MethodInsnNode call ? local(caller, call) : null;
        if (helper != null && !found.contains(helper)) {
          found.add(helper);
        }
      }
    }
    return found;
  }

  private MethodFlow local(MethodFlow caller, MethodInsnNode call) {
    if (!call.owner.equals(caller.owner.name)) {
      return null;
    }
    MethodNode method = program.index.declared(call.owner, call.name, call.desc);
    boolean hidden = method != null && (method.access & Opcodes.ACC_PUBLIC) == 0 && !Program.isAbstract(method)
        && !call.name.contains("lambda$") && (method.access & Opcodes.ACC_SYNTHETIC) == 0;
    return hidden ? program.flow(caller.owner, method) : null;
  }
}
