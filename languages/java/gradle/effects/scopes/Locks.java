package nitpicker.effects.scopes;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.IntPredicate;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Call;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Locks {
  private record Pair(String type, Set<String> open, Set<String> close) {}

  private static final List<Pair> PAIRS = List.of(
      new Pair("java/util/concurrent/locks/Lock", Set.of("lock", "lockInterruptibly", "tryLock"), Set.of("unlock")),
      new Pair("kotlinx/coroutines/sync/Mutex", Set.of("lock", "tryLock"), Set.of("unlock")));
  private static final List<String> SEMAPHORES =
      List.of("java/util/concurrent/Semaphore", "kotlinx/coroutines/sync/Semaphore");
  private static final Set<String> ACQUIRE = Set.of("acquire", "acquireUninterruptibly", "tryAcquire");
  private static final Set<String> MUTATORS = Set.of("put", "putIfAbsent", "putAll", "set", "add", "addAll",
      "compute", "computeIfAbsent", "computeIfPresent", "merge", "offer", "replace", "store", "lazySet",
      "setValue", "setPlain", "setRelease", "getAndSet", "compareAndSet", "remove", "clear");
  private final Program program;
  private final Permits permits;

  public Locks(Program program) {
    this.program = program;
    this.permits = new Permits(program);
  }

  public List<Scopes.Scope> locks() {
    List<Scopes.Scope> found = new ArrayList<>();
    for (MethodFlow flow : program.all()) {
      if ((flow.method.access & Opcodes.ACC_SYNCHRONIZED) != 0) {
        found.add(new Scopes.Scope("synchronized", flow, 0, flow.insns.length - 1));
      }
      if (!flow.analyzed()) {
        continue;
      }
      for (int index = 0; index < flow.insns.length; index++) {
        Scopes.Scope scope = open(flow, index);
        if (scope != null) {
          found.add(scope);
        }
      }
    }
    return found;
  }

  public List<Scopes.Scope> commits() {
    List<Scopes.Scope> found = new ArrayList<>();
    for (MethodFlow flow : program.all()) {
      for (int index = 0; flow.analyzed() && index < flow.insns.length; index++) {
        if (flow.insns[index] instanceof MethodInsnNode call && call.name.equals("setAutoCommit")
            && program.index.isSubtype(call.owner, "java/sql/Connection") && index > 0
            && flow.insns[index - 1].getOpcode() == Opcodes.ICONST_0) {
          int end = last(flow, index, at -> calls(flow, at, "java/sql/Connection", Set.of("commit", "rollback")),
              at -> calls(flow, at, "java/sql/Connection", Set.of("setAutoCommit")));
          found.add(new Scopes.Scope("Connection.setAutoCommit(false)", flow, index, end));
        }
      }
    }
    return found;
  }

  private Scopes.Scope open(MethodFlow flow, int index) {
    AbstractInsnNode insn = flow.insns[index];
    if (insn.getOpcode() == Opcodes.MONITORENTER) {
      int end = last(flow, index, at -> flow.insns[at].getOpcode() == Opcodes.MONITOREXIT,
          at -> flow.insns[at].getOpcode() == Opcodes.MONITORENTER);
      return new Scopes.Scope("synchronized", flow, index, end);
    }
    if (!(insn instanceof MethodInsnNode call)) {
      return null;
    }
    for (Pair pair : PAIRS) {
      if (pair.open().contains(call.name) && program.index.isSubtype(call.owner, pair.type())) {
        int end = last(flow, index, at -> calls(flow, at, pair.type(), pair.close()),
            at -> calls(flow, at, pair.type(), pair.open()));
        return new Scopes.Scope(Scopes.simple(call.owner) + "." + call.name + "()", flow, index, end);
      }
    }
    if (ACQUIRE.contains(call.name) && program.index.isSubtypeOfAny(call.owner, SEMAPHORES)
        && permits.single(flow, index)) {
      int end = last(flow, index, at -> calls(flow, at, call.owner, Set.of("release")),
          at -> calls(flow, at, call.owner, ACQUIRE));
      return new Scopes.Scope(Scopes.simple(call.owner) + "." + call.name + "()", flow, index, end);
    }
    return null;
  }

  private boolean calls(MethodFlow flow, int at, String type, Set<String> names) {
    return flow.insns[at] instanceof MethodInsnNode call && names.contains(call.name)
        && program.index.isSubtype(call.owner, type);
  }

  private int last(MethodFlow flow, int open, IntPredicate close, IntPredicate reopen) {
    Set<String> object = object(flow, open);
    int end = flow.insns.length - 1;
    int found = -1;
    for (int index = open + 1; index < flow.insns.length; index++) {
      boolean same = object.isEmpty() || !disjoint(object, object(flow, index));
      if (reopen.test(index) && same) {
        end = index;
        break;
      }
      if (close.test(index) && same) {
        found = index;
      }
    }
    return found < 0 ? end : found;
  }

  private static boolean disjoint(Set<String> left, Set<String> right) {
    for (String key : right) {
      if (left.contains(key)) {
        return false;
      }
    }
    return true;
  }

  private static Set<String> object(MethodFlow flow, int index) {
    AbstractInsnNode insn = flow.insns[index];
    SourceValue value = insn instanceof MethodInsnNode ? flow.receiver(index)
        : flow.operands(index).isEmpty() ? null : flow.operands(index).get(0);
    Set<String> keys = new LinkedHashSet<>();
    if (value == null) {
      return keys;
    }
    Origins.Identity identity = new Origins(flow).identity(value);
    for (int slot : identity.slots()) {
      keys.add("slot:" + slot);
    }
    for (int terminal : identity.terminals()) {
      if (flow.insns[terminal] instanceof FieldInsnNode field) {
        keys.add("field:" + field.owner + "." + field.name);
      }
    }
    return keys;
  }

  public boolean fillOnce(Scopes.Scope scope, Call site) {
    MethodFlow flow = scope.flow();
    if (site.flow() != flow || !flow.analyzed()) {
      return false;
    }
    Set<String> written = written(flow, scope.start(), scope.end(), true);
    Origins origins = new Origins(flow);
    for (int index = scope.start(); !written.isEmpty() && index < site.index(); index++) {
      if (flow.insns[index] instanceof JumpInsnNode jump && jump.getOpcode() != Opcodes.GOTO
          && guards(flow, index, flow.index(jump.label), site.index())) {
        Set<String> read = new LinkedHashSet<>();
        for (SourceValue operand : flow.operands(index)) {
          origins.dependsOn(operand, at -> state(flow, at, read));
        }
        if (!disjoint(read, written)) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean guards(MethodFlow flow, int jump, int target, int site) {
    if (target > site) {
      return true;
    }
    for (int index = jump + 1; index < target; index++) {
      int opcode = flow.insns[index].getOpcode();
      boolean leaves = opcode == Opcodes.GOTO && flow.index(((JumpInsnNode) flow.insns[index]).label) > site;
      if ((opcode >= Opcodes.IRETURN && opcode <= Opcodes.RETURN) || opcode == Opcodes.ATHROW || leaves) {
        return true;
      }
    }
    return false;
  }

  private Set<String> written(MethodFlow flow, int start, int end, boolean helpers) {
    Set<String> keys = new LinkedHashSet<>();
    for (int index = start; index <= end && index < flow.insns.length; index++) {
      AbstractInsnNode insn = flow.insns[index];
      if (insn instanceof FieldInsnNode field && !continuation(field.owner)
          && (insn.getOpcode() == Opcodes.PUTFIELD || insn.getOpcode() == Opcodes.PUTSTATIC)) {
        keys.add(field.owner + "." + field.name);
      } else if (insn instanceof MethodInsnNode call && accessor(flow, call, "set") != null) {
        keys.add(accessor(flow, call, "set"));
      } else if (insn instanceof MethodInsnNode call && MUTATORS.contains(call.name)) {
        object(flow, index).stream().filter(key -> key.startsWith("field:")).forEach(key -> keys.add(key.substring(6)));
      } else if (insn instanceof MethodInsnNode call && helpers && call.owner.equals(flow.owner.name)) {
        MethodNode method = program.index.declared(call.owner, call.name, call.desc);
        MethodFlow helper = method == null ? null : program.flow(flow.owner, method);
        if (helper != null && helper.analyzed()) {
          keys.addAll(written(helper, 0, helper.insns.length - 1, false));
        }
      }
    }
    return keys;
  }

  private boolean continuation(String owner) {
    return program.index.isSubtype(owner, "kotlin/coroutines/jvm/internal/BaseContinuationImpl");
  }

  private boolean state(MethodFlow flow, int at, Set<String> read) {
    AbstractInsnNode insn = flow.insns[at];
    if (insn instanceof FieldInsnNode field && !continuation(field.owner)
        && (insn.getOpcode() == Opcodes.GETFIELD || insn.getOpcode() == Opcodes.GETSTATIC)) {
      read.add(field.owner + "." + field.name);
    } else if (insn instanceof MethodInsnNode call && accessor(flow, call, "get") != null) {
      read.add(accessor(flow, call, "get"));
    }
    return false;
  }

  private static String accessor(MethodFlow flow, MethodInsnNode call, String prefix) {
    boolean own = call.owner.equals(flow.owner.name) && call.name.length() > prefix.length()
        && call.name.startsWith(prefix) && Character.isUpperCase(call.name.charAt(prefix.length()));
    if (!own) {
      return null;
    }
    String property = call.name.substring(prefix.length());
    return call.owner + "." + Character.toLowerCase(property.charAt(0)) + property.substring(1);
  }
}
