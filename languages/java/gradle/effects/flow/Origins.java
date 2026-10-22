package nitpicker.effects.flow;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.function.IntPredicate;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.analysis.Frame;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Origins {
  public record Identity(Set<Integer> terminals, Set<Integer> slots, Set<Integer> parameters) {}

  private static final int LIMIT = 400;
  private final MethodFlow flow;

  public Origins(MethodFlow flow) {
    this.flow = flow;
  }

  public Identity identity(SourceValue value) {
    Identity found = new Identity(new LinkedHashSet<>(), new LinkedHashSet<>(), new LinkedHashSet<>());
    Set<Integer> seen = new HashSet<>();
    Deque<Integer> queue = new ArrayDeque<>(sources(value));
    while (!queue.isEmpty() && seen.size() < LIMIT) {
      int index = queue.poll();
      if (!seen.add(index)) {
        continue;
      }
      AbstractInsnNode insn = flow.insns[index];
      if (isLoad(insn)) {
        int slot = ((VarInsnNode) insn).var;
        found.slots().add(slot);
        queue.addAll(storedValues(index, slot, found, slot));
      } else if (insn.getOpcode() == Opcodes.CHECKCAST || isDup(insn)) {
        queue.addAll(passed(index));
      } else {
        found.terminals().add(index);
      }
    }
    return found;
  }

  public boolean dependsOn(SourceValue value, IntPredicate test) {
    Set<Integer> seen = new HashSet<>();
    Deque<Integer> queue = new ArrayDeque<>(sources(value));
    while (!queue.isEmpty() && seen.size() < LIMIT) {
      int index = queue.poll();
      if (!seen.add(index)) {
        continue;
      }
      if (test.test(index)) {
        return true;
      }
      AbstractInsnNode insn = flow.insns[index];
      if (isLoad(insn)) {
        queue.addAll(storedValues(index, ((VarInsnNode) insn).var, null, -1));
      } else if (isDup(insn)) {
        queue.addAll(passed(index));
      } else {
        for (SourceValue operand : flow.operands(index)) {
          queue.addAll(sources(operand));
        }
      }
    }
    return false;
  }

  public List<Integer> sources(SourceValue value) {
    if (value == null) {
      return List.of();
    }
    return value.insns.stream().map(flow::index).filter(index -> index >= 0).toList();
  }

  private List<Integer> passed(int index) {
    Frame<SourceValue> frame = flow.frame(index);
    if (frame == null || frame.getStackSize() == 0) {
      return List.of();
    }
    return sources(frame.getStack(frame.getStackSize() - 1));
  }

  private List<Integer> storedValues(int index, int slot, Identity found, int parameterSlot) {
    Frame<SourceValue> frame = flow.frame(index);
    if (frame == null || slot >= frame.getLocals()) {
      return List.of();
    }
    SourceValue local = frame.getLocal(slot);
    if (local.insns.isEmpty() && found != null) {
      found.parameters().add(parameterSlot);
    }
    Deque<Integer> values = new ArrayDeque<>();
    for (int store : sources(local)) {
      if (flow.insns[store] instanceof VarInsnNode) {
        values.addAll(passed(store));
      }
    }
    return List.copyOf(values);
  }

  static boolean isLoad(AbstractInsnNode insn) {
    int opcode = insn.getOpcode();
    return insn instanceof VarInsnNode && opcode >= Opcodes.ILOAD && opcode <= Opcodes.ALOAD;
  }

  private static boolean isDup(AbstractInsnNode insn) {
    return insn.getOpcode() == Opcodes.DUP;
  }
}
