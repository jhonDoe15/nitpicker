package nitpicker.effects.writes;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.analysis.SourceValue;

public final class Unsafe implements Summaries.Classifier {
  public static final String PAYMENT = "payment";
  public static final String INSERT = "insert";
  public static final String MESSAGE = "message";
  private static final Set<String> IDEMPOTENCY_KEYS = Set.of("setIdempotencyKey");
  private static final Set<String> DEDUPLICATION_IDS =
      Set.of("messageDeduplicationId", "withMessageDeduplicationId", "setMessageDeduplicationId");
  private static final Pattern INSERT_TEXT = Pattern.compile("(?is)\\s*insert\\s.*");
  private static final Pattern UPSERT_TEXT = Pattern.compile(
      "(?is).*(on\\s+conflict|on\\s+duplicate\\s+key|insert\\s+ignore|insert\\s+or\\s+(ignore|replace)).*");
  private static final List<String> SQL_OWNERS =
      List.of("java/sql/Connection", "org/springframework/jdbc/core/simple/JdbcClient");
  private final Program program;

  public Unsafe(Program program) {
    this.program = program;
  }

  @Override
  public Map<String, List<String>> direct(Summaries summaries, Call call) {
    String label = Summaries.label(call.owner(), call.name(), call.desc());
    String kind = program.kinds.direct(call.owner(), call.name(), call.desc());
    if (payment(call)) {
      return passes(call, IDEMPOTENCY_KEYS) ? Map.of() : Map.of(PAYMENT, List.of(label));
    }
    if (Kinds.MESSAGE.equals(kind)) {
      return passes(call, DEDUPLICATION_IDS) ? Map.of() : Map.of(MESSAGE, List.of(label));
    }
    boolean sql = Kinds.DATABASE.equals(kind) || program.index.isSubtypeOfAny(call.owner(), SQL_OWNERS);
    if (sql && plainInsert(call)) {
      return Map.of(INSERT, List.of(label));
    }
    return kind == null ? null : Map.of();
  }

  private static boolean payment(Call call) {
    return call.name().equals("create")
        && (call.owner().startsWith("com/stripe/model/") || call.owner().startsWith("com/stripe/service/"));
  }

  private static boolean passes(Call call, Set<String> markers) {
    MethodFlow flow = call.flow();
    if (!(flow.insns[call.index()] instanceof MethodInsnNode) || !flow.analyzed()) {
      return false;
    }
    Origins origins = new Origins(flow);
    for (SourceValue operand : flow.operands(call.index())) {
      if (origins.dependsOn(operand, index -> flow.insns[index] instanceof MethodInsnNode marked
          && markers.contains(marked.name))) {
        return true;
      }
    }
    return false;
  }

  private static boolean plainInsert(Call call) {
    MethodFlow flow = call.flow();
    if (!(flow.insns[call.index()] instanceof MethodInsnNode) || !flow.analyzed()) {
      return false;
    }
    Type[] arguments = Type.getArgumentTypes(call.desc());
    Origins origins = new Origins(flow);
    for (int position = 0; position < arguments.length; position++) {
      if (!arguments[position].getDescriptor().equals("Ljava/lang/String;")) {
        continue;
      }
      for (int source : origins.identity(flow.argument(call.index(), position)).terminals()) {
        if (flow.insns[source] instanceof LdcInsnNode ldc && ldc.cst instanceof String text
            && INSERT_TEXT.matcher(text).matches() && !UPSERT_TEXT.matcher(text).matches()) {
          return true;
        }
      }
    }
    return false;
  }
}
