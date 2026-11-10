package nitpicker.designfacts.facts;

import com.sun.source.tree.*;
import java.nio.file.Path;
import java.util.*;
import javax.lang.model.element.Modifier;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;

public final class Prepare {
  private Prepare() {}

  public static void run(Project project, Path root) {
    Map<Path, Boolean> disabled = new HashMap<>();
    for (TypeInfo type : project.types) {
      Path directory = root.resolve(type.unit.file).getParent();
      boolean off = disabled.computeIfAbsent(directory, dir -> Lombok.disabledBy(dir, root));
      Lombok.apply(type, !off);
    }
    for (TypeInfo type : project.types) {
      markAccessors(type);
      addRecordAccessors(type);
    }
    for (TypeInfo type : project.types) {
      type.designKind = kindOf(type);
      assignIds(type);
    }
  }

  private static void markAccessors(TypeInfo type) {
    for (MethodInfo method : type.methods) {
      if (method.tree == null || method.ctor || method.isStatic || !method.params.isEmpty()) {
        continue;
      }
      String returned = returnedName(method.tree);
      FieldInfo field = returned == null ? null : type.field(returned);
      if (field != null && !field.isStatic) {
        method.accessorField = returned;
      }
    }
  }

  private static void addRecordAccessors(TypeInfo type) {
    if (!type.isRecord()) {
      return;
    }
    for (FieldInfo field : List.copyOf(type.fields)) {
      if (!field.isStatic && !type.declaresGetter(field.name)) {
        Set<Modifier> flags = Set.of(Modifier.PUBLIC);
        int line = type.unit.line(field.tree);
        Tree returned = field.tree.getType();
        MethodInfo.Getter getter =
            new MethodInfo.Getter(field.name, returned, field.name, flags, line);
        type.methods.add(new MethodInfo(type, getter));
      }
    }
  }

  private static String returnedName(MethodTree method) {
    if (method.getBody() == null || method.getBody().getStatements().size() != 1) {
      return null;
    }
    if (!(method.getBody().getStatements().get(0) instanceof ReturnTree statement)
        || statement.getExpression() == null) {
      return null;
    }
    Tree expression = Names.unparen(statement.getExpression());
    if (expression instanceof IdentifierTree identifier) {
      return identifier.getName().toString();
    }
    if (expression instanceof MemberSelectTree select
        && Names.unparen(select.getExpression()) instanceof IdentifierTree base
        && base.getName().contentEquals("this")) {
      return select.getIdentifier().toString();
    }
    return null;
  }

  private static String kindOf(TypeInfo type) {
    return switch (type.kind()) {
      case INTERFACE, ANNOTATION_TYPE -> "interface";
      case ENUM -> "enum";
      case RECORD -> "data";
      case CLASS -> behaves(type) ? "class" : "data";
      default -> null;
    };
  }

  private static boolean behaves(TypeInfo type) {
    for (MethodInfo method : type.methods) {
      if (!method.ctor && !trivial(method)) {
        return true;
      }
    }
    return false;
  }

  private static boolean trivial(MethodInfo method) {
    if (method.accessorField != null) {
      return true;
    }
    int arity = method.params.size();
    return !method.isStatic
        && (method.name.equals("toString") && arity == 0
            || method.name.equals("hashCode") && arity == 0
            || method.name.equals("equals") && arity == 1
            || isSetter(method));
  }

  private static boolean isSetter(MethodInfo method) {
    if (method.tree == null
        || !method.name.startsWith("set")
        || method.params.size() != 1
        || method.tree.getBody() == null
        || method.tree.getBody().getStatements().size() != 1) {
      return false;
    }
    StatementTree statement = method.tree.getBody().getStatements().get(0);
    return statement instanceof ExpressionStatementTree expression
        && expression.getExpression() instanceof AssignmentTree;
  }

  private static void assignIds(TypeInfo type) {
    Map<String, Integer> counts = new HashMap<>();
    for (MethodInfo method : type.methods) {
      counts.merge(method.ctor ? "<init>" : method.name, 1, Integer::sum);
    }
    Map<String, Integer> ids = new HashMap<>();
    for (MethodInfo method : type.methods) {
      method.id = idOf(method, counts, false);
      ids.merge(method.id, 1, Integer::sum);
    }
    Map<String, Integer> seen = new HashMap<>();
    for (MethodInfo method : type.methods) {
      String written = ids.get(method.id) > 1 ? idOf(method, counts, true) : method.id;
      int ordinal = seen.merge(written, 1, Integer::sum);
      method.id = ordinal == 1 ? written : written + "~" + ordinal;
    }
  }

  private static String idOf(MethodInfo method, Map<String, Integer> counts, boolean written) {
    String name = method.ctor ? "<init>" : method.name;
    String suffix = counts.get(name) > 1 ? "(" + parameterTexts(method, written) + ")" : "";
    return method.owner.id + "." + name + suffix;
  }

  private static String parameterTexts(MethodInfo method, boolean written) {
    StringJoiner joiner = new StringJoiner(",");
    for (ParamInfo param : method.params) {
      joiner.add(written ? Names.compact(param.type) : String.valueOf(Names.typeText(param.type)));
    }
    return joiner.toString();
  }
}
