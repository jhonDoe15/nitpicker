package nitpicker.effects.deleted;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Origins;
import nitpicker.effects.flow.Program;
import nitpicker.effects.kinds.Summaries;
import nitpicker.effects.races.Repositories;
import org.objectweb.asm.Opcodes;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.LdcInsnNode;
import org.objectweb.asm.tree.MethodInsnNode;
import org.objectweb.asm.tree.MethodNode;

final class QueryReads {
  record Read(String entity, String label, String text, String declaring, String name, String desc,
      MethodFlow flow, int index) {}

  private static final String QUERY = "Lorg/springframework/data/jpa/repository/Query;";
  private static final String MODIFYING = "Lorg/springframework/data/jpa/repository/Modifying;";
  private static final Pattern READ = Pattern.compile("(find|get|read|query|search|stream|count|exists)[A-Z]\\w*");
  private static final Pattern ROOT = Pattern.compile("(?i)\\b(?:from|join)\\s+([A-Za-z_][\\w.]*)");
  private static final List<String> BUILT_IN = List.of("findById", "findAll", "getById", "getReferenceById",
      "existsById", "count", "findAllById", "getOne");
  private static final List<String> MANAGERS = List.of("jakarta/persistence/EntityManager",
      "javax/persistence/EntityManager", "org/hibernate/SharedSessionContract");
  private static final List<String> JDBC = List.of("org/springframework/jdbc/core/JdbcOperations",
      "org/springframework/jdbc/core/namedparam/NamedParameterJdbcOperations");
  private static final Pattern JDBC_READ = Pattern.compile("query\\w*");
  private final Program program;
  private final SoftDelete soft;
  private final Repositories repositories;

  QueryReads(Program program, SoftDelete soft) {
    this.program = program;
    this.soft = soft;
    this.repositories = new Repositories(program);
  }

  List<Read> declared() {
    List<Read> reads = new ArrayList<>();
    for (ClassNode node : program.index.projectClasses()) {
      if (program.index.isExternal(node.name) || !program.index.header(node.name).isInterface()
          || !program.kinds.isRepository(node.name)) {
        continue;
      }
      String entity = repositories.entity(node.name);
      for (MethodNode method : node.methods) {
        if ((method.access & Opcodes.ACC_ABSTRACT) != 0 && !BUILT_IN.contains(method.name)) {
          declared(reads, node, entity, method);
        }
      }
    }
    return reads;
  }

  private void declared(List<Read> reads, ClassNode node, String entity, MethodNode method) {
    boolean modifying = Annotations.find(MODIFYING, method.visibleAnnotations, method.invisibleAnnotations) != null;
    AnnotationNode query = Annotations.find(QUERY, method.visibleAnnotations, method.invisibleAnnotations);
    String label = Summaries.label(node.name, method.name, method.desc);
    List<String> texts = Annotations.strings(query, "value");
    if (modifying) {
      return;
    }
    if (!texts.isEmpty()) {
      for (String found : entities(texts.get(0))) {
        reads.add(new Read(found, label, texts.get(0), node.name, method.name, method.desc, null, -1));
      }
    } else if (query == null && entity != null && READ.matcher(method.name).matches()) {
      reads.add(new Read(entity, label, method.name, node.name, method.name, method.desc, null, -1));
    }
  }

  List<Read> inline() {
    List<Read> reads = new ArrayList<>();
    for (MethodFlow flow : program.all()) {
      if (flow.external || !flow.analyzed()) {
        continue;
      }
      for (int index = 0; index < flow.insns.length; index++) {
        if (flow.insns[index] instanceof MethodInsnNode call && queryCall(call)) {
          String text = constant(flow, index);
          for (String entity : text == null ? List.<String>of() : entities(text)) {
            String label = Summaries.label(call.owner, call.name, call.desc);
            reads.add(new Read(entity, label, text, null, call.name, call.desc, flow, index));
          }
        }
      }
    }
    return reads;
  }

  private boolean queryCall(MethodInsnNode call) {
    boolean manager = (call.name.equals("createQuery") || call.name.equals("createNativeQuery"))
        && program.index.isSubtypeOfAny(call.owner, MANAGERS);
    boolean jdbc = JDBC_READ.matcher(call.name).matches() && program.index.isSubtypeOfAny(call.owner, JDBC);
    return manager || jdbc;
  }

  private String constant(MethodFlow flow, int call) {
    Origins origins = new Origins(flow);
    for (int source : origins.identity(flow.argument(call, 0)).terminals()) {
      if (flow.insns[source] instanceof LdcInsnNode ldc && ldc.cst instanceof String text) {
        return text;
      }
    }
    return null;
  }

  private List<String> entities(String text) {
    List<String> found = new ArrayList<>();
    Matcher matcher = ROOT.matcher(text);
    while (matcher.find()) {
      String root = matcher.group(1);
      String bare = root.substring(root.lastIndexOf('.') + 1);
      for (String entity : soft.flags().keySet()) {
        boolean named = bare.equalsIgnoreCase(SoftDelete.simple(entity))
            || bare.equalsIgnoreCase(soft.table(entity).substring(soft.table(entity).lastIndexOf('.') + 1));
        if (named && !found.contains(entity)) {
          found.add(entity);
        }
      }
    }
    return found;
  }
}
