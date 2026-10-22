package nitpicker.designfacts;

import com.sun.source.tree.*;
import java.nio.file.Path;
import java.util.*;

final class Prepare {
  private Prepare() {}

  static void run(Project project, Path root) {
    Map<Path, Boolean> disabled = new HashMap<>();
    for (TypeInfo type : project.types) {
      Path directory = root.resolve(type.unit.file).getParent();
      boolean off = disabled.computeIfAbsent(directory, dir -> Lombok.disabledBy(dir, root));
      Lombok.apply(type, !off);
    }
    for (TypeInfo type : project.types) {
      markAccessors(type);
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
      case INTERFACE -> "interface";
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
    if (method.tree == null || !method.name.startsWith("set") || method.params.size() != 1
        || method.tree.getBody() == null || method.tree.getBody().getStatements().size() != 1) {
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
    for (MethodInfo method : type.methods) {
      String name = method.ctor ? "<init>" : method.name;
      String suffix = counts.get(name) > 1 ? "(" + parameterTexts(method) + ")" : "";
      method.id = type.id + "." + name + suffix;
    }
  }

  private static String parameterTexts(MethodInfo method) {
    StringJoiner joiner = new StringJoiner(",");
    for (ParamInfo param : method.params) {
      joiner.add(String.valueOf(Names.typeText(param.type)));
    }
    return joiner.toString();
  }
}
