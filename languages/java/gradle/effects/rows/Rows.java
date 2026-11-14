package nitpicker.effects.rows;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

public final class Rows {
  private static final Pattern FINDER = Pattern.compile("(find|get|read|query|search)[A-Z]\\w*|findAll");
  private static final Pattern ELEMENT = Pattern.compile("\\)L[\\w/$]+<[+-]?L([\\w/$]+)[;<]");
  private static final Pattern REPOSITORY = Pattern.compile("Repository<L([\\w/$]+);");
  private static final List<String> COLLECTIONS = List.of("java/util/Collection", "java/lang/Iterable");
  private static final List<String> ENTITY = List.of("Ljakarta/persistence/Entity;", "Ljavax/persistence/Entity;");
  private static final List<String> ASYNC = List.of("reactor/core/publisher/Mono", "reactor/core/publisher/Flux",
      "java/util/concurrent/Future", "java/util/concurrent/CompletionStage", "java/util/stream/BaseStream",
      "org/springframework/data/domain/Slice");
  private final Program program;

  public Rows(Program program) {
    this.program = program;
  }

  public boolean finder(MethodInsnNode call) {
    boolean extension = call.owner.startsWith("org/springframework/data/repository/")
        && call.name.equals("findByIdOrNull");
    return extension || (program.kinds.isRepository(call.owner) && FINDER.matcher(call.name).matches());
  }

  public boolean collection(MethodInsnNode call) {
    Type result = Type.getReturnType(call.desc);
    return result.getSort() == Type.OBJECT && program.index.isSubtypeOfAny(result.getInternalName(), COLLECTIONS)
        && !program.index.isSubtype(result.getInternalName(), "org/springframework/data/domain/Slice");
  }

  public boolean single(MethodInsnNode call) {
    Type result = Type.getReturnType(call.desc);
    if (result.getSort() != Type.OBJECT) {
      return false;
    }
    String type = result.getInternalName();
    return !program.index.isSubtypeOfAny(type, COLLECTIONS) && !program.index.isSubtypeOfAny(type, ASYNC)
        && !type.equals("java/lang/Object");
  }

  public ClassNode entityOf(MethodInsnNode call) {
    String declaration = program.declaration(call.owner, call.name, call.desc);
    MethodNode method = declaration == null ? null : program.method(declaration);
    String found = method == null ? null : first(ELEMENT, method.signature);
    if (found == null) {
      found = concrete(Type.getReturnType(call.desc));
    }
    if (found == null) {
      found = repositoryEntity(program.index.node(call.owner), 0);
    }
    ClassNode node = program.index.node(found);
    return node != null && persistent(node) ? node : null;
  }

  private String concrete(Type result) {
    String type = result.getSort() == Type.OBJECT ? result.getInternalName() : "java/lang/Object";
    boolean wrapper = type.equals("java/lang/Object") || type.equals("java/util/Optional")
        || program.index.isSubtypeOfAny(type, COLLECTIONS) || program.index.isSubtypeOfAny(type, ASYNC);
    return wrapper ? null : type;
  }

  public boolean persistent(ClassNode node) {
    return Annotations.findAny(ENTITY, node.visibleAnnotations, node.invisibleAnnotations) != null;
  }

  private String repositoryEntity(ClassNode node, int depth) {
    if (node == null || depth > 4) {
      return null;
    }
    String own = first(REPOSITORY, node.signature);
    if (own != null) {
      return own;
    }
    for (String parent : node.interfaces) {
      String found = repositoryEntity(program.index.node(parent), depth + 1);
      if (found != null) {
        return found;
      }
    }
    return null;
  }

  private static String first(Pattern pattern, String signature) {
    if (signature == null) {
      return null;
    }
    Matcher matcher = pattern.matcher(signature);
    return matcher.find() ? matcher.group(1) : null;
  }
}
