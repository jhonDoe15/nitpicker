package nitpicker.effects.flow;

import java.lang.ref.SoftReference;
import java.util.ArrayList;
import java.util.List;
import nitpicker.effects.classes.Lines;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.InvokeDynamicInsnNode;
import org.objectweb.asm.tree.LocalVariableNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.analysis.Analyzer;
import org.objectweb.asm.tree.analysis.AnalyzerException;
import org.objectweb.asm.tree.analysis.Frame;
import org.objectweb.asm.tree.analysis.SourceInterpreter;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class MethodFlow {
  public final ClassNode owner;
  public final MethodNode method;
  public final AbstractInsnNode[] insns;
  public final int[] lines;
  public final String file;
  public final String name;
  private SoftReference<Frame<SourceValue>[]> frames;
  private boolean unanalyzable;
  private List<Loop> loops;

  MethodFlow(ClassNode owner, MethodNode method, Lines lines, String name) {
    this.owner = owner;
    this.name = name;
    this.method = method;
    this.insns = method.instructions.toArray();
    this.lines = lines.of(method);
    this.file = lines.file() != null ? lines.file() : owner.sourceFile == null ? "" : owner.sourceFile;
  }

  private static Frame<SourceValue>[] analyze(String owner, MethodNode method) {
    if (method.instructions.size() == 0) {
      return null;
    }
    try {
      return new Analyzer<>(new SourceInterpreter()).analyze(owner, method);
    } catch (AnalyzerException | RuntimeException unanalyzable) {
      return null;
    }
  }

  private Frame<SourceValue>[] frames() {
    Frame<SourceValue>[] found = frames == null ? null : frames.get();
    if (found == null && !unanalyzable) {
      found = analyze(owner.name, method);
      unanalyzable = found == null;
      frames = found == null ? null : new SoftReference<>(found);
    }
    return found;
  }

  public boolean analyzed() {
    return frames() != null;
  }

  public boolean kotlin() {
    return file.endsWith(".kt");
  }

  public int index(AbstractInsnNode insn) {
    return method.instructions.indexOf(insn);
  }

  public int line(int index) {
    return index < 0 || index >= lines.length ? 0 : lines[index];
  }

  List<Loop> loops() {
    return loops;
  }

  void setLoops(List<Loop> found) {
    loops = found;
  }

  public Frame<SourceValue> frame(int index) {
    Frame<SourceValue>[] all = frames();
    return all == null || index < 0 || index >= all.length ? null : all[index];
  }

  public List<SourceValue> operands(int index) {
    Frame<SourceValue> frame = frame(index);
    AbstractInsnNode insn = insns[index];
    int count = consumed(insn);
    List<SourceValue> values = new ArrayList<>();
    if (frame == null || count > frame.getStackSize()) {
      return values;
    }
    for (int position = frame.getStackSize() - count; position < frame.getStackSize(); position++) {
      values.add(frame.getStack(position));
    }
    return values;
  }

  public SourceValue argument(int callIndex, int argument) {
    List<SourceValue> values = operands(callIndex);
    MethodInsnNode call = (MethodInsnNode) insns[callIndex];
    int offset = call.getOpcode() == Opcodes.INVOKESTATIC ? 0 : 1;
    int position = offset + argument;
    return position < values.size() ? values.get(position) : null;
  }

  public SourceValue receiver(int callIndex) {
    List<SourceValue> values = operands(callIndex);
    return insns[callIndex].getOpcode() == Opcodes.INVOKESTATIC || values.isEmpty() ? null : values.get(0);
  }

  static int consumed(AbstractInsnNode insn) {
    if (insn instanceof MethodInsnNode call) {
      int arguments = Type.getArgumentTypes(call.desc).length;
      return call.getOpcode() == Opcodes.INVOKESTATIC ? arguments : arguments + 1;
    }
    if (insn instanceof InvokeDynamicInsnNode indy) {
      return Type.getArgumentTypes(indy.desc).length;
    }
    int opcode = insn.getOpcode();
    if (opcode >= Opcodes.IALOAD && opcode <= Opcodes.SALOAD) {
      return 2;
    }
    if (opcode >= Opcodes.IASTORE && opcode <= Opcodes.SASTORE) {
      return 3;
    }
    if (opcode == Opcodes.PUTFIELD) {
      return 2;
    }
    if ((opcode >= Opcodes.IADD && opcode <= Opcodes.DREM) || (opcode >= Opcodes.ISHL && opcode <= Opcodes.LXOR)
        || (opcode >= Opcodes.LCMP && opcode <= Opcodes.DCMPG)
        || (opcode >= Opcodes.IF_ICMPEQ && opcode <= Opcodes.IF_ACMPNE)) {
      return 2;
    }
    return switch (opcode) {
      case Opcodes.GETFIELD, Opcodes.CHECKCAST, Opcodes.ARRAYLENGTH, Opcodes.INSTANCEOF, Opcodes.INEG,
          Opcodes.LNEG, Opcodes.I2L, Opcodes.L2I, Opcodes.IFEQ, Opcodes.IFNE, Opcodes.IFLT, Opcodes.IFGE,
          Opcodes.IFGT, Opcodes.IFLE, Opcodes.IFNULL, Opcodes.IFNONNULL, Opcodes.ARETURN, Opcodes.IRETURN,
          Opcodes.ASTORE, Opcodes.ISTORE, Opcodes.LSTORE, Opcodes.TABLESWITCH, Opcodes.LOOKUPSWITCH,
          Opcodes.MONITORENTER, Opcodes.MONITOREXIT, Opcodes.ATHROW, Opcodes.PUTSTATIC, Opcodes.LRETURN,
          Opcodes.FRETURN, Opcodes.DRETURN, Opcodes.FSTORE, Opcodes.DSTORE -> 1;
      default -> 0;
    };
  }

  public String localName(int slot, int index) {
    if (method.localVariables == null) {
      return null;
    }
    String fallback = null;
    for (LocalVariableNode local : method.localVariables) {
      if (local.index != slot) {
        continue;
      }
      int start = index(local.start);
      int end = index(local.end);
      if (start <= index + 1 && index <= end) {
        return local.name;
      }
      fallback = fallback == null ? local.name : fallback;
    }
    return fallback;
  }

  public int parameterSlot(int parameter) {
    int slot = (method.access & Opcodes.ACC_STATIC) == 0 ? 1 : 0;
    Type[] types = Type.getArgumentTypes(method.desc);
    for (int position = 0; position < parameter && position < types.length; position++) {
      slot += types[position].getSize();
    }
    return slot;
  }
}
