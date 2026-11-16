package nitpicker.effects.rows;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.VarInsnNode;
import org.objectweb.asm.tree.analysis.Frame;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Uses {
  private final MethodFlow flow;
  private final Map<AbstractInsnNode, List<Integer>> consumers = new HashMap<>();
  private final Map<AbstractInsnNode, List<Integer>> loads = new HashMap<>();

  public Uses(MethodFlow flow) {
    this.flow = flow;
    for (int index = 0; index < flow.insns.length; index++) {
      for (SourceValue operand : flow.operands(index)) {
        for (AbstractInsnNode source : operand.insns) {
          consumers.computeIfAbsent(source, key -> new ArrayList<>()).add(index);
        }
      }
      if (Origins.isLoad(flow.insns[index]) && flow.frame(index) != null) {
        Frame<SourceValue> frame = flow.frame(index);
        int slot = ((VarInsnNode) flow.insns[index]).var;
        if (slot < frame.getLocals()) {
          for (AbstractInsnNode store : frame.getLocal(slot).insns) {
            loads.computeIfAbsent(store, key -> new ArrayList<>()).add(index);
          }
        }
      }
    }
  }

  public List<Integer> of(int producer) {
    Set<Integer> found = new LinkedHashSet<>();
    Set<Integer> seen = new LinkedHashSet<>(List.of(producer));
    Deque<Integer> pending = new ArrayDeque<>(List.of(producer));
    while (!pending.isEmpty() && seen.size() < 200) {
      int alias = pending.poll();
      for (int user : consumers.getOrDefault(flow.insns[alias], List.of())) {
        int opcode = flow.insns[user].getOpcode();
        if (opcode == Opcodes.CHECKCAST || opcode == Opcodes.DUP) {
          enqueue(user, seen, pending);
        } else if (opcode == Opcodes.ASTORE) {
          loads.getOrDefault(flow.insns[user], List.of()).forEach(load -> enqueue(load, seen, pending));
        } else {
          found.add(user);
        }
      }
    }
    return new ArrayList<>(found);
  }

  private static void enqueue(int index, Set<Integer> seen, Deque<Integer> pending) {
    if (seen.add(index)) {
      pending.add(index);
    }
  }
}
