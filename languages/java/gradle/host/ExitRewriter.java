package nitpicker.host;

import java.nio.charset.StandardCharsets;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

final class ExitRewriter {
  private static final String EXIT = "nitpicker/host/Exit";
  private static final String RUNTIME = "java/lang/Runtime";
  private static final byte[][] MARKERS = {
    "exit".getBytes(StandardCharsets.US_ASCII),
    "halt".getBytes(StandardCharsets.US_ASCII),
    "ShutdownHook".getBytes(StandardCharsets.US_ASCII),
  };

  private ExitRewriter() {}

  static byte[] rewrite(byte[] bytes) {
    if (!mentionsExit(bytes)) {
      return bytes;
    }
    try {
      ClassReader reader = new ClassReader(bytes);
      ClassWriter writer = new ClassWriter(reader, 0);
      reader.accept(new Classes(writer), 0);
      return writer.toByteArray();
    } catch (RuntimeException unreadable) {
      return bytes;
    }
  }

  private static boolean mentionsExit(byte[] bytes) {
    for (byte[] marker : MARKERS) {
      if (indexOf(bytes, marker) >= 0) {
        return true;
      }
    }
    return false;
  }

  private static int indexOf(byte[] bytes, byte[] marker) {
    int last = bytes.length - marker.length;
    for (int start = 0; start <= last; start++) {
      int offset = 0;
      while (offset < marker.length && bytes[start + offset] == marker[offset]) {
        offset++;
      }
      if (offset == marker.length) {
        return start;
      }
    }
    return -1;
  }

  private static final class Classes extends ClassVisitor {
    Classes(ClassWriter writer) {
      super(Opcodes.ASM9, writer);
    }

    @Override
    public MethodVisitor visitMethod(
        int access, String name, String descriptor, String signature, String[] exceptions) {
      MethodVisitor next = super.visitMethod(access, name, descriptor, signature, exceptions);
      return next == null ? null : new Calls(next);
    }
  }

  private static final class Calls extends MethodVisitor {
    Calls(MethodVisitor next) {
      super(Opcodes.ASM9, next);
    }

    @Override
    public void visitMethodInsn(
        int opcode, String owner, String name, String descriptor, boolean isInterface) {
      if (opcode == Opcodes.INVOKESTATIC && owner.equals("java/lang/System")
          && name.equals("exit") && descriptor.equals("(I)V")) {
        super.visitMethodInsn(Opcodes.INVOKESTATIC, EXIT, "exit", "(I)V", false);
      } else if (opcode == Opcodes.INVOKEVIRTUAL && owner.equals(RUNTIME)
          && (name.equals("exit") || name.equals("halt")) && descriptor.equals("(I)V")) {
        super.visitMethodInsn(
            Opcodes.INVOKESTATIC, EXIT, name, "(Ljava/lang/Runtime;I)V", false);
      } else if (opcode == Opcodes.INVOKEVIRTUAL && owner.equals(RUNTIME)
          && name.equals("addShutdownHook") && descriptor.equals("(Ljava/lang/Thread;)V")) {
        super.visitMethodInsn(
            Opcodes.INVOKESTATIC, EXIT, "addHook", "(Ljava/lang/Runtime;Ljava/lang/Thread;)V", false);
      } else if (opcode == Opcodes.INVOKEVIRTUAL && owner.equals(RUNTIME)
          && name.equals("removeShutdownHook") && descriptor.equals("(Ljava/lang/Thread;)Z")) {
        super.visitMethodInsn(
            Opcodes.INVOKESTATIC, EXIT, "removeHook", "(Ljava/lang/Runtime;Ljava/lang/Thread;)Z", false);
      } else {
        super.visitMethodInsn(opcode, owner, name, descriptor, isInterface);
      }
    }
  }
}
