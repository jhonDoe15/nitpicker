package nitpicker.effects.races;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import nitpicker.effects.Report;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.classes.Beans;
import nitpicker.effects.flow.Lambdas;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.LookupSwitchInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.TableSwitchInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class CheckThenWrite {
  public static final String RULE = "CheckThenWriteWithoutLock";
  private static final Pattern WRITE = Pattern.compile(
      "save\\w*|persist\\w*|merge|delete\\w*|remove\\w*|insert\\w*|update\\w*|upsert\\w*|store\\w*");
  private static final Pattern READ =
      Pattern.compile("(find|get|read|query|search|exists|count|is|has|load|fetch)\\w*");
  private static final List<String> TRANSACTIONAL = List.of(
      "Lorg/springframework/transaction/annotation/Transactional;", "Ljakarta/transaction/Transactional;",
      "Ljavax/transaction/Transactional;");
  private static final List<String> OPERATORS = List.of("org/springframework/transaction/support/TransactionOperations",
      "org/springframework/transaction/reactive/TransactionalOperator");
  private record Site(int index, MethodInsnNode call, String repository) {}

  private final Program program;
  private final Repositories repositories;
  private final Report report;

  public CheckThenWrite(Program program, Report report) {
    this.program = program;
    this.repositories = new Repositories(program);
    this.report = report;
  }

  public void run() {
    for (MethodFlow flow : program.entries()) {
      boolean visible = (flow.method.access & Opcodes.ACC_PUBLIC) != 0
          && (flow.method.access & (Opcodes.ACC_STATIC | Opcodes.ACC_SYNCHRONIZED)) == 0;
      if (visible && Beans.stereotype(program.index, flow.owner) && flow.analyzed() && !guarded(flow)) {
        check(flow);
      }
    }
  }

  private boolean guarded(MethodFlow flow) {
    AnnotationNode transactional = Beans.onMethodOrClass(flow.owner, flow.method, TRANSACTIONAL);
    String isolation = Annotations.enumValue(transactional, "isolation");
    if ("SERIALIZABLE".equals(isolation) || "REPEATABLE_READ".equals(isolation)) {
      return true;
    }
    for (AbstractInsnNode insn : flow.insns) {
      if (insn.getOpcode() == Opcodes.MONITORENTER
          || (insn instanceof MethodInsnNode call && program.index.isSubtypeOfAny(call.owner, OPERATORS))) {
        return true;
      }
    }
    return false;
  }

  private void check(MethodFlow flow) {
    List<Site> reads = new ArrayList<>();
    List<Site> writes = new ArrayList<>();
    for (int index = 0; index < flow.insns.length; index++) {
      if (!(flow.insns[index] instanceof MethodInsnNode call)
          || !Kinds.DATABASE.equals(program.kinds.direct(call.owner, call.name, call.desc))) {
        continue;
      }
      String repository = repositories.receiver(flow, index);
      if (repository == null) {
        continue;
      }
      if (WRITE.matcher(call.name).matches()) {
        writes.add(new Site(index, call, repository));
      } else if (READ.matcher(call.name).matches()) {
        reads.add(new Site(index, call, repository));
      }
    }
    Origins origins = new Origins(flow);
    for (Site read : reads) {
      if (repositories.locked(read.call(), read.repository())) {
        continue;
      }
      for (Site write : writes) {
        if (write.index() > read.index() && repositories.same(read.repository(), write.repository())
            && decided(flow, origins, read, write)) {
          add(flow, read, write, flow, write.index());
        }
      }
      lazyWrites(flow, origins, read);
    }
  }

  private boolean decided(MethodFlow flow, Origins origins, Site read, Site write) {
    List<Integer> jumps = decidingJumps(flow, origins, read.index(), write.index());
    boolean derived = flow.operands(write.index()).stream().anyMatch(
        operand -> origins.dependsOn(operand, source -> source == read.index()));
    boolean versioned = repositories.versioned(repositories.entity(write.repository()));
    return jumps.stream().anyMatch(jump -> !derived || (!versioned && !absence(flow, origins, jump, read.index())));
  }

  private List<Integer> decidingJumps(MethodFlow flow, Origins origins, int read, int write) {
    List<Integer> jumps = new ArrayList<>();
    for (int index = read + 1; index < write; index++) {
      AbstractInsnNode insn = flow.insns[index];
      boolean branch = (insn instanceof JumpInsnNode && insn.getOpcode() != Opcodes.GOTO)
          || insn instanceof TableSwitchInsnNode || insn instanceof LookupSwitchInsnNode;
      if (branch && flow.operands(index).stream().anyMatch(
          operand -> origins.dependsOn(operand, source -> source == read))) {
        jumps.add(index);
      }
    }
    return jumps;
  }

  private boolean absence(MethodFlow flow, Origins origins, int jump, int read) {
    int opcode = flow.insns[jump].getOpcode();
    boolean nullTest = opcode == Opcodes.IFNULL || opcode == Opcodes.IFNONNULL;
    boolean flagTest = opcode == Opcodes.IFEQ || opcode == Opcodes.IFNE;
    boolean sizeTest = opcode >= Opcodes.IFLT && opcode <= Opcodes.IFLE && !flagTest;
    if (!nullTest && !flagTest && !sizeTest) {
      return false;
    }
    for (SourceValue operand : flow.operands(jump)) {
      for (int terminal : origins.identity(operand).terminals()) {
        if (!present(flow, origins, terminal, read, flagTest, sizeTest)) {
          return false;
        }
      }
    }
    return true;
  }

  private boolean present(MethodFlow flow, Origins origins, int terminal, int read, boolean flagTest,
      boolean sizeTest) {
    if (terminal == read) {
      return !flagTest && !sizeTest;
    }
    if (flow.insns[terminal] instanceof MethodInsnNode count
        && program.index.isSubtype(count.owner, "java/util/Collection")
        && (flagTest ? count.name.equals("isEmpty") : sizeTest && count.name.equals("size"))) {
      return origins.identity(flow.receiver(terminal)).terminals().contains(read);
    }
    if (!(flow.insns[terminal] instanceof MethodInsnNode call) || !call.owner.equals("java/util/Optional")) {
      return false;
    }
    boolean test = call.name.equals("isPresent") || call.name.equals("isEmpty");
    boolean unwrap = call.name.equals("orElse") || call.name.equals("orElseGet") || call.name.equals("get");
    return (flagTest ? test : unwrap) && origins.identity(flow.receiver(terminal)).terminals().contains(read);
  }

  private void lazyWrites(MethodFlow flow, Origins origins, Site read) {
    for (Lambdas.Use use : program.lambdas(flow)) {
      if (use.consumer() <= read.index() || !(flow.insns[use.consumer()] instanceof MethodInsnNode consumer)
          || !consumer.name.equals("orElseGet")
          || !origins.dependsOn(flow.receiver(use.consumer()), source -> source == read.index())) {
        continue;
      }
      for (MethodFlow body : use.bodies()) {
        for (int index = 0; index < body.insns.length; index++) {
          String repository = body.insns[index] instanceof MethodInsnNode call
              && WRITE.matcher(call.name).matches() && body.analyzed() ? repositories.receiver(body, index) : null;
          if (repository != null && repositories.same(read.repository(), repository)) {
            add(flow, read, new Site(index, (MethodInsnNode) body.insns[index], repository), body, index);
          }
        }
      }
    }
  }

  private void add(MethodFlow entry, Site read, Site write, MethodFlow where, int index) {
    String readLabel = Summaries.label(read.call().owner, read.call().name, read.call().desc);
    String writeLabel = Summaries.label(write.call().owner, write.call().name, write.call().desc);
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("read", readLabel);
    extra.put("write", writeLabel);
    report.add(RULE, where, index, Report.methodName(entry) + "|" + readLabel + "|" + writeLabel, extra);
  }
}
