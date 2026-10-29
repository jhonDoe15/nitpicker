import java.util.Set;
import java.util.function.Predicate;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;

final class Instructions {
  static final Set<String> PREDICATES =
      Set.of("filter", "anyMatch", "allMatch", "noneMatch", "takeWhile", "dropWhile", "peek", "removeIf", "sorted",
          "min", "max");
  static final Set<String> VALUES =
      Set.of("Ljava/lang/Boolean;", "Ljava/lang/Byte;", "Ljava/lang/Character;", "Ljava/lang/Short;",
          "Ljava/lang/Integer;", "Ljava/lang/Long;", "Ljava/lang/Float;", "Ljava/lang/Double;");
  private static final Set<Integer> DOUBLE_WORDS =
      Set.of(Opcodes.LALOAD, Opcodes.DALOAD, Opcodes.LADD, Opcodes.DADD, Opcodes.LSUB, Opcodes.DSUB,
          Opcodes.LMUL, Opcodes.DMUL, Opcodes.LDIV, Opcodes.DDIV, Opcodes.LREM, Opcodes.DREM, Opcodes.LSHL,
          Opcodes.LSHR, Opcodes.LUSHR, Opcodes.LAND, Opcodes.LOR, Opcodes.LXOR, Opcodes.LNEG, Opcodes.DNEG,
          Opcodes.I2L, Opcodes.I2D, Opcodes.L2D, Opcodes.F2L, Opcodes.F2D, Opcodes.D2L, Opcodes.LCONST_0,
          Opcodes.LCONST_1, Opcodes.DCONST_0, Opcodes.DCONST_1);

  private Instructions() {}

  static boolean holdsData(String desc, Predicate<String> isEnum) {
    Type type = Type.getType(desc);
    return (type.getSort() == Type.OBJECT || type.getSort() == Type.ARRAY)
        && !VALUES.contains(desc)
        && !(type.getSort() == Type.OBJECT && isEnum.test(type.getInternalName()));
  }

  static int sizeOf(int opcode) {
    return DOUBLE_WORDS.contains(opcode) ? 2 : 1;
  }

  static boolean returnsNothing(int opcode) {
    return (opcode >= Opcodes.IFEQ && opcode <= Opcodes.IFLE)
        || (opcode >= Opcodes.TABLESWITCH && opcode <= Opcodes.ARETURN)
        || opcode == Opcodes.ATHROW
        || opcode == Opcodes.MONITORENTER
        || opcode == Opcodes.MONITOREXIT
        || opcode == Opcodes.IFNULL
        || opcode == Opcodes.IFNONNULL;
  }
}
