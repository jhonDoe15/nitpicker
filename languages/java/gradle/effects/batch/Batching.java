package nitpicker.effects.batch;

import java.util.List;
import java.util.Set;
import nitpicker.effects.flow.Loop;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Batching {
  private static final Set<String> WRITES =
      Set.of("persist", "merge", "save", "saveAndFlush", "remove", "delete", "flush", "clear", "detach");
  private static final Set<String> SESSIONS = Set.of("flush", "clear");
  private static final Set<String> FILLS = Set.of("add", "addAll", "put", "putAll", "append", "offer", "push");
  private static final List<String> CONTEXTS = List.of("jakarta/persistence/EntityManager",
      "javax/persistence/EntityManager", "org/hibernate/SharedSessionContract");
  private final Program program;

  public Batching(Program program) {
    this.program = program;
  }

  public boolean flushedInSteps(MethodFlow flow, int index, MethodInsnNode call) {
    if (!WRITES.contains(call.name) || !flow.analyzed()) {
      return false;
    }
    for (Loop loop : around(flow, index)) {
      if (guardedFlush(flow, loop)) {
        return true;
      }
    }
    return false;
  }

  public boolean accumulated(MethodFlow flow, int index, SourceValue value) {
    Origins origins = new Origins(flow);
    Origins.Identity identity = origins.identity(value);
    for (Loop loop : around(flow, index)) {
      for (int slot : identity.slots()) {
        if (declaredBefore(flow, slot, loop, identity) && filledIn(flow, origins, slot, loop)) {
          return true;
        }
      }
    }
    return false;
  }

  private List<Loop> around(MethodFlow flow, int index) {
    return program.loops(flow).stream().filter(loop -> loop.contains(index)).toList();
  }

  private boolean guardedFlush(MethodFlow flow, Loop loop) {
    Origins origins = new Origins(flow);
    for (int index = loop.start(); index <= loop.end(); index++) {
      if (flow.insns[index] instanceof MethodInsnNode call && SESSIONS.contains(call.name) && session(call.owner)
          && moduloGuard(flow, origins, loop, index)) {
        return true;
      }
    }
    return false;
  }

  private boolean session(String owner) {
    return program.kinds.isRepository(owner) || program.index.isSubtypeOfAny(owner, CONTEXTS);
  }

  private boolean moduloGuard(MethodFlow flow, Origins origins, Loop loop, int call) {
    for (int index = loop.start(); index < call; index++) {
      if (!(flow.insns[index] instanceof JumpInsnNode jump) || jump.getOpcode() == Opcodes.GOTO
          || flow.index(jump.label) <= call) {
        continue;
      }
      for (SourceValue operand : flow.operands(index)) {
        if (origins.dependsOn(operand, at -> isRemainder(flow.insns[at]))) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean isRemainder(AbstractInsnNode insn) {
    return insn.getOpcode() == Opcodes.IREM || insn.getOpcode() == Opcodes.LREM;
  }

  private boolean declaredBefore(MethodFlow flow, int slot, Loop loop, Origins.Identity identity) {
    if (identity.parameters().contains(slot)) {
      return true;
    }
    for (int index = 0; index < loop.start(); index++) {
      if (flow.insns[index] instanceof VarInsnNode store && store.getOpcode() == Opcodes.ASTORE && store.var == slot) {
        return true;
      }
    }
    return false;
  }

  private boolean filledIn(MethodFlow flow, Origins origins, int slot, Loop loop) {
    for (int index = loop.start(); index <= loop.end(); index++) {
      if (flow.insns[index] instanceof MethodInsnNode call && FILLS.contains(call.name)
          && origins.identity(flow.receiver(index)).slots().contains(slot)) {
        return true;
      }
    }
    return false;
  }
}
