package nitpicker.effects.writes;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Call;
import nitpicker.effects.kinds.Kinds;
import nitpicker.effects.kinds.Summaries;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;
import org.objectweb.asm.tree.TypeInsnNode;

public final class Events implements Summaries.Classifier {
  public static final String WRITE = "write";
  public static final String MESSAGE = "message";
  public static final String DEFERRED = "deferred";
  private record Listener(ClassNode owner, MethodNode method, List<String> events, boolean deferred) {}

  private static final Pattern WRITES = Pattern.compile("save\\w*|persist\\w*|merge|remove\\w*|delete\\w*|"
      + "insert\\w*|update\\w*|upsert\\w*|batchUpdate|executeUpdate|executeLargeUpdate|executeBatch|bulk\\w*|"
      + "put\\w*|replace\\w*|set|hset|increment\\w*|store\\w*");
  private static final String SYNC_LISTENER = "Lorg/springframework/context/event/EventListener;";
  private static final String TRANSACTION_LISTENER =
      "Lorg/springframework/transaction/event/TransactionalEventListener;";
  private static final String SYNCHRONIZATION = "org/springframework/transaction/support/TransactionSynchronization";
  private static final String PUBLISHER = "org/springframework/context/ApplicationEventPublisher";
  private final Program program;
  private final List<Listener> listeners = new ArrayList<>();

  public Events(Program program) {
    this.program = program;
    for (ClassNode node : program.index.projectClasses()) {
      for (MethodNode method : node.methods) {
        listener(node, method);
      }
    }
  }

  @Override
  public Map<String, List<String>> direct(Summaries summaries, Call call) {
    String label = Summaries.label(call.owner(), call.name(), call.desc());
    if (call.name().equals("publishEvent") && program.index.isSubtype(call.owner(), PUBLISHER)) {
      return dispatch(summaries, call, label);
    }
    String kind = program.kinds.direct(call.owner(), call.name(), call.desc());
    if (Kinds.DATABASE.equals(kind) && WRITES.matcher(call.name()).matches()) {
      return Map.of(WRITE, List.of(label));
    }
    if (Kinds.MESSAGE.equals(kind)) {
      return Map.of(afterCommit(call.flow()) ? DEFERRED : MESSAGE, List.of(label));
    }
    return kind == null ? null : Map.of();
  }

  public boolean afterCommit(MethodFlow flow) {
    String name = flow.method.name;
    return (name.equals("afterCommit") || name.equals("afterCompletion"))
        && program.index.isSubtype(flow.owner.name, SYNCHRONIZATION);
  }

  private Map<String, List<String>> dispatch(Summaries summaries, Call call, String label) {
    String event = eventType(call);
    Map<String, List<String>> found = new LinkedHashMap<>();
    if (event == null) {
      return found;
    }
    for (Listener listener : listeners) {
      if (!program.index.isSubtypeOfAny(event, listener.events())) {
        continue;
      }
      String handler = Summaries.label(listener.owner().name, listener.method().name, listener.method().desc);
      Map<String, List<String>> effects = summaries.of(listener.owner().name, listener.method().name,
          listener.method().desc);
      for (Map.Entry<String, List<String>> effect : effects.entrySet()) {
        boolean published = !effect.getKey().equals(WRITE);
        if (listener.deferred() && !published) {
          continue;
        }
        List<String> path = new ArrayList<>(List.of(label, handler));
        path.addAll(effect.getValue());
        found.putIfAbsent(listener.deferred() ? DEFERRED : effect.getKey(), path);
      }
    }
    return found;
  }

  private String eventType(Call call) {
    MethodFlow flow = call.flow();
    if (!(flow.insns[call.index()] instanceof MethodInsnNode) || !flow.analyzed()) {
      return null;
    }
    Origins.Identity identity = new Origins(flow).identity(flow.argument(call.index(), 0));
    for (int terminal : identity.terminals()) {
      String type = typeOf(flow.insns[terminal]);
      if (type != null) {
        return type;
      }
    }
    Type[] parameters = Type.getArgumentTypes(flow.method.desc);
    for (int position = 0; position < parameters.length; position++) {
      if (identity.parameters().contains(flow.parameterSlot(position))
          && parameters[position].getSort() == Type.OBJECT) {
        return parameters[position].getInternalName();
      }
    }
    return null;
  }

  private static String typeOf(AbstractInsnNode insn) {
    Type type = insn.getOpcode() == Opcodes.NEW ? Type.getObjectType(((TypeInsnNode) insn).desc)
        : insn instanceof MethodInsnNode call ? Type.getReturnType(call.desc)
        : insn instanceof FieldInsnNode field ? Type.getType(field.desc) : null;
    boolean known = type != null && type.getSort() == Type.OBJECT && !type.getInternalName().equals("java/lang/Object");
    return known ? type.getInternalName() : null;
  }

  private void listener(ClassNode node, MethodNode method) {
    AnnotationNode sync = Annotations.find(SYNC_LISTENER, method.visibleAnnotations, method.invisibleAnnotations);
    AnnotationNode transactional =
        Annotations.find(TRANSACTION_LISTENER, method.visibleAnnotations, method.invisibleAnnotations);
    AnnotationNode annotation = transactional != null ? transactional : sync;
    if (annotation == null) {
      return;
    }
    List<String> events = new ArrayList<>(Annotations.strings(annotation, "classes"));
    events.addAll(Annotations.strings(annotation, "value"));
    Type[] parameters = Type.getArgumentTypes(method.desc);
    if (events.isEmpty() && parameters.length > 0 && parameters[0].getSort() == Type.OBJECT) {
      events.add(parameters[0].getInternalName());
    }
    String phase = Annotations.enumValue(annotation, "phase");
    boolean deferred = transactional != null && !"BEFORE_COMMIT".equals(phase);
    listeners.add(new Listener(node, method, events, deferred));
  }
}
