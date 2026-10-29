package nitpicker.effects.flow;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.IntPredicate;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.TryCatchBlockNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public record Loop(int start, int end, boolean paging, List<int[]> attempts) {
  public boolean contains(int index) {
    return index >= start && index <= end;
  }

  public boolean attempt(int index) {
    for (int[] range : attempts) {
      if (index >= range[0] && index < range[1]) {
        return true;
      }
    }
    return false;
  }

  public static List<Loop> find(MethodFlow flow, IntPredicate io, IntPredicate element) {
    Map<Integer, Integer> regions = new TreeMap<>();
    for (int index = 0; index < flow.insns.length; index++) {
      if (flow.insns[index] instanceof JumpInsnNode jump) {
        int target = flow.index(jump.label);
        if (target >= 0 && target <= index) {
          regions.merge(target, index, Math::max);
        }
      }
    }
    List<Loop> loops = new ArrayList<>();
    for (Map.Entry<Integer, Integer> region : regions.entrySet()) {
      int start = region.getKey();
      int end = region.getValue();
      loops.add(new Loop(start, end, paging(flow, start, end, io, element), attempts(flow, start, end)));
    }
    return loops;
  }

  private static boolean paging(MethodFlow flow, int start, int end, IntPredicate io, IntPredicate element) {
    if (!flow.analyzed()) {
      return false;
    }
    Origins origins = new Origins(flow);
    IntPredicate elements = index -> index >= start && index <= end && element.test(index);
    IntPredicate inside = index -> index >= start && index <= end && io.test(index)
        && !takesElement(flow, origins, index, elements);
    for (int index = start; index <= end; index++) {
      if (!conditional(flow.insns[index]) || !exits(flow, index, start, end)) {
        continue;
      }
      for (SourceValue operand : flow.operands(index)) {
        if (origins.dependsOn(operand, inside)) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean takesElement(MethodFlow flow, Origins origins, int call, IntPredicate elements) {
    for (SourceValue operand : flow.operands(call)) {
      if (origins.dependsOn(operand, elements)) {
        return true;
      }
    }
    return false;
  }

  private static boolean exits(MethodFlow flow, int index, int start, int end) {
    int target = flow.index(((JumpInsnNode) flow.insns[index]).label);
    return leaves(flow, target, start, end) || leaves(flow, index + 1, start, end);
  }

  private static boolean leaves(MethodFlow flow, int successor, int start, int end) {
    if (successor < start || successor > end) {
      return true;
    }
    int next = real(flow, successor);
    if (next < 0) {
      return true;
    }
    AbstractInsnNode insn = flow.insns[next];
    if (insn.getOpcode() >= Opcodes.IRETURN && insn.getOpcode() <= Opcodes.RETURN) {
      return true;
    }
    if (insn.getOpcode() == Opcodes.GOTO) {
      int target = flow.index(((JumpInsnNode) insn).label);
      return target < start || target > end;
    }
    return false;
  }

  static int real(MethodFlow flow, int from) {
    for (int index = from; index < flow.insns.length; index++) {
      if (flow.insns[index].getOpcode() >= 0) {
        return index;
      }
    }
    return -1;
  }

  private static boolean conditional(AbstractInsnNode insn) {
    int opcode = insn.getOpcode();
    return insn instanceof JumpInsnNode && opcode != Opcodes.GOTO && opcode != Opcodes.JSR;
  }

  private static List<int[]> attempts(MethodFlow flow, int start, int end) {
    List<int[]> found = new ArrayList<>();
    if (flow.method.tryCatchBlocks == null) {
      return found;
    }
    for (TryCatchBlockNode block : flow.method.tryCatchBlocks) {
      int from = flow.index(block.start);
      int to = flow.index(block.end);
      int handler = flow.index(block.handler);
      if (block.type == null || from < start || to > end + 1 || handler < start || handler > end) {
        continue;
      }
      if (leavesOnSuccess(flow, from, to, start, end)) {
        found.add(new int[] {from, to});
      }
    }
    return found;
  }

  private static boolean leavesOnSuccess(MethodFlow flow, int from, int to, int start, int end) {
    for (int index = from; index < to && index < flow.insns.length; index++) {
      AbstractInsnNode insn = flow.insns[index];
      int opcode = insn.getOpcode();
      if (opcode >= Opcodes.IRETURN && opcode <= Opcodes.RETURN) {
        return true;
      }
      if (insn instanceof JumpInsnNode jump) {
        int target = flow.index(jump.label);
        if (target < start || target > end) {
          return true;
        }
      }
    }
    int after = real(flow, to);
    return after >= 0 && leaves(flow, after, start, end);
  }
}
