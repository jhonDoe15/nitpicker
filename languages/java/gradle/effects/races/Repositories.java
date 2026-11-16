package nitpicker.effects.races;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.Type;
import org.objectweb.asm.tree.AbstractInsnNode;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.FieldInsnNode;
import org.objectweb.asm.tree.FieldNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

public final class Repositories {
  private static final String LOCK = "Lorg/springframework/data/jpa/repository/Lock;";
  private static final String QUERY = "Lorg/springframework/data/jpa/repository/Query;";
  private static final List<String> VERSION = List.of("Ljakarta/persistence/Version;",
      "Ljavax/persistence/Version;", "Lorg/springframework/data/annotation/Version;");
  private static final Pattern ENTITY = Pattern.compile("Repository<L([^;<]+)[;<]");
  private static final Pattern FOR_UPDATE = Pattern.compile("(?i)\\bfor\\s+(update|share)\\b");
  private final Program program;

  public Repositories(Program program) {
    this.program = program;
  }

  String receiver(MethodFlow flow, int index) {
    MethodInsnNode call = (MethodInsnNode) flow.insns[index];
    if (call.getOpcode() != Opcodes.INVOKESTATIC) {
      return program.kinds.isRepository(call.owner) ? call.owner : null;
    }
    Type[] arguments = Type.getArgumentTypes(call.desc);
    if (arguments.length == 0 || arguments[0].getSort() != Type.OBJECT) {
      return null;
    }
    Origins.Identity identity = new Origins(flow).identity(flow.argument(index, 0));
    for (int terminal : identity.terminals()) {
      String type = typeOf(flow.insns[terminal]);
      if (type != null && program.kinds.isRepository(type)) {
        return type;
      }
    }
    Type[] parameters = Type.getArgumentTypes(flow.method.desc);
    for (int position = 0; position < parameters.length; position++) {
      if (identity.parameters().contains(flow.parameterSlot(position)) && parameters[position].getSort() == Type.OBJECT
          && program.kinds.isRepository(parameters[position].getInternalName())) {
        return parameters[position].getInternalName();
      }
    }
    return null;
  }

  private static String typeOf(AbstractInsnNode insn) {
    Type type = insn instanceof FieldInsnNode field ? Type.getType(field.desc)
        : insn instanceof MethodInsnNode call ? Type.getReturnType(call.desc) : null;
    return type != null && type.getSort() == Type.OBJECT ? type.getInternalName() : null;
  }

  boolean same(String left, String right) {
    return program.index.isSubtype(left, right) || program.index.isSubtype(right, left);
  }

  public String entity(String repository) {
    List<String> types = new ArrayList<>(List.of(repository));
    types.addAll(program.index.ancestors(repository));
    for (String type : types) {
      ClassNode node = program.index.node(type);
      Matcher matcher = node == null || node.signature == null ? null : ENTITY.matcher(node.signature);
      if (matcher != null && matcher.find()) {
        return matcher.group(1);
      }
    }
    return null;
  }

  boolean versioned(String entity) {
    if (entity == null) {
      return false;
    }
    List<String> types = new ArrayList<>(List.of(entity));
    types.addAll(program.index.ancestors(entity));
    for (String type : types) {
      ClassNode node = program.index.node(type);
      if (node == null) {
        continue;
      }
      for (FieldNode field : node.fields) {
        if (Annotations.findAny(VERSION, field.visibleAnnotations, field.invisibleAnnotations) != null) {
          return true;
        }
      }
      for (MethodNode method : node.methods) {
        if (Annotations.findAny(VERSION, method.visibleAnnotations, method.invisibleAnnotations) != null) {
          return true;
        }
      }
    }
    return false;
  }

  boolean locked(MethodInsnNode call, String repository) {
    List<String> types = new ArrayList<>(List.of(repository));
    types.addAll(program.index.ancestors(repository));
    String arguments = call.desc.substring(0, call.desc.indexOf(')') + 1);
    for (String type : types) {
      ClassNode node = program.index.node(type);
      if (node == null) {
        continue;
      }
      for (MethodNode method : node.methods) {
        if (method.name.equals(call.name) && method.desc.startsWith(arguments) && lockedMethod(method)) {
          return true;
        }
      }
    }
    return false;
  }

  private static boolean lockedMethod(MethodNode method) {
    if (Annotations.find(LOCK, method.visibleAnnotations, method.invisibleAnnotations) != null) {
      return true;
    }
    AnnotationNode query = Annotations.find(QUERY, method.visibleAnnotations, method.invisibleAnnotations);
    return Annotations.strings(query, "value").stream().anyMatch(text -> FOR_UPDATE.matcher(text).find());
  }
}
