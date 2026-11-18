package nitpicker.effects.jobs;

import java.util.List;
import nitpicker.effects.flow.Loop;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.JumpInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TryCatchBlockNode;

final class Isolation {
  private final Program program;
  private final Summaries summaries;

  Isolation(Program program, Summaries summaries) {
    this.program = program;
    this.summaries = summaries;
  }

  boolean isolated(MethodFlow flow, int index) {
    Loop loop = innermost(flow, index);
    return covered(flow, index, loop);
  }

  boolean swallows(String owner, String name, String desc) {
    String declaration = program.declaration(owner, name, desc);
    MethodNode method = declaration == null ? null : program.method(declaration);
    String type = declaration == null ? null : declaration.substring(0, declaration.indexOf('.'));
    ClassNode node = program.index.node(type);
    if (method == null || node == null || Program.isAbstract(method)) {
      return false;
    }
    MethodFlow helper = program.flow(node, method);
    for (int index = 0; index < helper.insns.length; index++) {
      if (helper.insns[index] instanceof MethodInsnNode call && io(helper, index, call)
          && covered(helper, index, null)) {
        return true;
      }
    }
    return false;
  }

  private boolean io(MethodFlow flow, int index, MethodInsnNode call) {
    var kinds = summaries.at(new Call(flow, index, call.owner, call.name, call.desc));
    return kinds.containsKey(Kinds.DATABASE) || kinds.containsKey(Kinds.REMOTE);
  }

  private boolean covered(MethodFlow flow, int index, Loop loop) {
    List<TryCatchBlockNode> blocks = flow.method.tryCatchBlocks;
    if (blocks == null) {
      return false;
    }
    for (TryCatchBlockNode block : blocks) {
      int from = flow.index(block.start);
      int to = flow.index(block.end);
      int handler = flow.index(block.handler);
      boolean inside = loop == null || (handler >= loop.start() && handler <= loop.end());
      if (block.type != null && index >= from && index < to && inside && continues(flow, handler, loop)) {
        return true;
      }
    }
    return false;
  }

  private Loop innermost(MethodFlow flow, int index) {
    Loop found = null;
    for (Loop loop : program.loops(flow)) {
      boolean tighter = found == null || loop.end() - loop.start() < found.end() - found.start();
      if (loop.contains(index) && tighter) {
        found = loop;
      }
    }
    return found;
  }

  private static boolean continues(MethodFlow flow, int handler, Loop loop) {
    boolean returning = loop == null;
    for (int index = handler; index < flow.insns.length; index++) {
      AbstractInsnNode insn = flow.insns[index];
      int opcode = insn.getOpcode();
      if (opcode == Opcodes.ATHROW) {
        return false;
      }
      if (opcode >= Opcodes.IRETURN && opcode <= Opcodes.RETURN) {
        return returning;
      }
      if (opcode == Opcodes.GOTO) {
        return loop == null || flow.index(((JumpInsnNode) insn).label) <= loop.end();
      }
    }
    return true;
  }
}
