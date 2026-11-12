import com.tngtech.archunit.core.domain.JavaClass;
import com.tngtech.archunit.core.domain.Source;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.LineNumberNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

final class ThrowSites {
  private static final String CONSTRUCTOR = "<init>";

  private ThrowSites() {}

  static Optional<Set<String>> of(JavaClass type) {
    Optional<Source> source = type.getSource();
    if (source.isEmpty() || !"file".equals(source.get().getUri().getScheme())) {
      return Optional.empty();
    }
    try {
      ClassNode node = new ClassNode();
      new ClassReader(Files.readAllBytes(Paths.get(source.get().getUri()))).accept(node, ClassReader.SKIP_FRAMES);
      Set<String> sites = new HashSet<>();
      node.methods.forEach(method -> collect(method, sites));
      return Optional.of(sites);
    } catch (IOException | RuntimeException unreadable) {
      return Optional.empty();
    }
  }

  static String key(String className, int line) {
    return className + "@" + line;
  }

  private static void collect(MethodNode method, Set<String> sites) {
    boolean supplier = (method.access & Opcodes.ACC_SYNTHETIC) != 0;
    int line = 0;
    for (AbstractInsnNode instruction : method.instructions) {
      if (instruction instanceof LineNumberNode) {
        line = ((LineNumberNode) instruction).line;
      } else if (isConstructor(instruction) && leavesWith(instruction, supplier)) {
        sites.add(key(((MethodInsnNode) instruction).owner.replace('/', '.'), line));
      }
    }
  }

  private static boolean isConstructor(AbstractInsnNode instruction) {
    return instruction.getOpcode() == Opcodes.INVOKESPECIAL
        && CONSTRUCTOR.equals(((MethodInsnNode) instruction).name);
  }

  private static boolean leavesWith(AbstractInsnNode instruction, boolean supplier) {
    AbstractInsnNode next = instruction.getNext();
    while (next != null && next.getOpcode() < 0) {
      next = next.getNext();
    }
    int opcode = next == null ? -1 : next.getOpcode();
    return opcode == Opcodes.ATHROW || (supplier && opcode == Opcodes.ARETURN);
  }
}
