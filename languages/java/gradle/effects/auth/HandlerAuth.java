package nitpicker.effects.auth;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import nitpicker.effects.Report;
import nitpicker.effects.classes.Annotations;
import nitpicker.effects.classes.ClassIndex;
import nitpicker.effects.flow.MethodFlow;
import nitpicker.effects.flow.Program;
import org.objectweb.asm.tree.AnnotationNode;
import org.objectweb.asm.tree.ClassNode;
import org.objectweb.asm.tree.MethodNode;

public final class HandlerAuth {
  public static final String RULE = "HandlerWithoutAuth";
  public static final int MIN_HANDLERS = 10;
  public static final int SHARE = 90;
  private static final String WEB = "Lorg/springframework/web/bind/annotation/";
  private static final List<String> CONTROLLERS = List.of(WEB + "RestController;",
      "Lorg/springframework/stereotype/Controller;");
  private static final List<String> MAPPINGS = List.of(WEB + "RequestMapping;", WEB + "GetMapping;",
      WEB + "PostMapping;", WEB + "PutMapping;", WEB + "DeleteMapping;", WEB + "PatchMapping;");
  private static final List<String> SECURITY = List.of("Lorg/springframework/security/access/prepost/PreAuthorize;",
      "Lorg/springframework/security/access/prepost/PostAuthorize;",
      "Lorg/springframework/security/access/annotation/Secured;", "Ljakarta/annotation/security/RolesAllowed;",
      "Ljavax/annotation/security/RolesAllowed;", "Ljakarta/annotation/security/PermitAll;",
      "Ljavax/annotation/security/PermitAll;", "Ljakarta/annotation/security/DenyAll;");
  private static final Set<String> PUBLIC_MARKS = Set.of("Public", "Anonymous", "AllowAnonymous", "Unauthenticated",
      "NoAuth", "NoAuthentication", "PermitAll");
  private record Handler(MethodFlow flow) {}

  private final Program program;
  private final Report report;

  public HandlerAuth(Program program, Report report) {
    this.program = program;
    this.report = report;
  }

  public void run() {
    List<Handler> bare = new ArrayList<>();
    Map<String, Integer> shapes = new TreeMap<>();
    int[] handlers = {0};
    for (ClassNode node : program.index.projectClasses()) {
      if (program.index.isExternal(node.name) || !controller(node)) {
        continue;
      }
      for (MethodNode method : node.methods) {
        if (!handler(method)) {
          continue;
        }
        handlers[0]++;
        String shape = shape(node, method);
        if (shape != null) {
          shapes.merge(shape, 1, Integer::sum);
        } else {
          bare.add(new Handler(program.flow(node, method)));
        }
      }
    }
    int total = handlers[0];
    int declared = total - bare.size();
    if (total >= MIN_HANDLERS && declared * 100 >= total * SHARE) {
      String usual = shapes.entrySet().stream().max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse("");
      for (Handler handler : bare) {
        add(handler, usual, declared, total);
      }
    }
  }

  private boolean controller(ClassNode node) {
    return Annotations.findAny(CONTROLLERS, node.visibleAnnotations, node.invisibleAnnotations) != null;
  }

  private boolean handler(MethodNode method) {
    if (method.instructions.size() == 0) {
      return false;
    }
    if (Annotations.findAny(MAPPINGS, method.visibleAnnotations, method.invisibleAnnotations) != null) {
      return true;
    }
    for (List<AnnotationNode> annotations : Annotations.lists(method.visibleAnnotations, method.invisibleAnnotations)) {
      for (AnnotationNode annotation : annotations) {
        String type = annotation.desc.substring(1, annotation.desc.length() - 1);
        if (MAPPINGS.stream().anyMatch(program.index.header(type).annotations()::contains)) {
          return true;
        }
      }
    }
    return false;
  }

  private String shape(ClassNode node, MethodNode method) {
    List<AnnotationNode> annotations = new ArrayList<>();
    Annotations.lists(method.visibleAnnotations, method.invisibleAnnotations).forEach(annotations::addAll);
    Annotations.lists(node.visibleAnnotations, node.invisibleAnnotations).forEach(annotations::addAll);
    for (String ancestor : program.index.ancestors(node.name)) {
      ClassNode parent = program.index.node(ancestor);
      if (parent == null) {
        continue;
      }
      Annotations.lists(parent.visibleAnnotations, parent.invisibleAnnotations).forEach(annotations::addAll);
      for (MethodNode inherited : parent.methods) {
        if (inherited.name.equals(method.name) && inherited.desc.equals(method.desc)) {
          Annotations.lists(inherited.visibleAnnotations, inherited.invisibleAnnotations)
              .forEach(annotations::addAll);
        }
      }
    }
    for (AnnotationNode annotation : annotations) {
      String shape = declares(annotation.desc);
      if (shape != null) {
        return shape;
      }
    }
    return null;
  }

  private String declares(String desc) {
    if (SECURITY.contains(desc)) {
      return simple(desc);
    }
    String type = desc.substring(1, desc.length() - 1);
    String name = simple(desc);
    if (PUBLIC_MARKS.contains(name)) {
      return name;
    }
    ClassIndex.Header header = program.index.header(type);
    for (String security : SECURITY) {
      if (header.annotations().contains(security)) {
        return name;
      }
    }
    return null;
  }

  private static String simple(String desc) {
    return desc.substring(desc.lastIndexOf('/') + 1, desc.length() - 1);
  }

  private void add(Handler handler, String usual, int declared, int handlers) {
    MethodFlow flow = handler.flow();
    int first = 0;
    while (first < flow.insns.length - 1 && flow.line(first) <= 0) {
      first++;
    }
    Map<String, Object> extra = new LinkedHashMap<>();
    extra.put("shape", "@" + usual);
    extra.put("declared", declared);
    extra.put("total", handlers);
    report.add(RULE, flow, first, Report.methodName(flow), extra);
  }
}
