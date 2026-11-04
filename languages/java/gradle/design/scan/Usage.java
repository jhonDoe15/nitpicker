package nitpicker.designfacts.scan;

import com.sun.source.tree.*;
import com.sun.source.util.TreePath;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;
import nitpicker.designfacts.scope.*;

public final class Usage {
  private record Value(String key, Ty ty, int param) {}

  private final Body body;
  private final Typer typer;
  private final Ctx ctx;
  public int closureDepth;
  public int conditionDepth;

  public Usage(Body body, Typer typer, Ctx ctx) {
    this.body = body;
    this.typer = typer;
    this.ctx = ctx;
  }

  public void identifier(IdentifierTree tree, TreePath path) {
    String name = tree.getName().toString();
    if (ctx.classDepth > 0 || name.equals("this") || name.equals("super")) {
      return;
    }
    Tree parent = path.getParentPath().getLeaf();
    if (parent instanceof MethodInvocationTree call && call.getMethodSelect() == tree) {
      return;
    }
    Local local = ctx.lookup(name);
    if (local != null) {
      if (local.param >= 0) {
        parameter(local, path);
      }
      return;
    }
    FieldInfo field = typer.lookup.bareField(name, ctx.owner);
    if (field != null && field.owner == ctx.owner && !field.isStatic) {
      body.ownFields.add(name);
    }
  }

  private void parameter(Local local, TreePath path) {
    Body.Use use = body.uses.get(local.param);
    if (use == null) {
      return;
    }
    if (closureDepth > 0) {
      use.opaque = true;
      return;
    }
    TreePath current = path;
    while (current.getParentPath().getLeaf() instanceof ParenthesizedTree) {
      current = current.getParentPath();
    }
    passed(use, current.getLeaf(), current.getParentPath().getLeaf());
  }

  private void passed(Body.Use use, Tree child, Tree parent) {
    switch (parent) {
      case MethodInvocationTree call -> forward(use, call, call.getArguments().indexOf(child));
      case NewClassTree creation -> forward(use, creation, creation.getArguments().indexOf(child));
      default -> use.opaque |= !inspected(child, parent);
    }
  }

  private static boolean inspected(Tree child, Tree parent) {
    return switch (parent) {
      case MemberSelectTree select -> select.getExpression() == child;
      case BinaryTree binary ->
          binary.getKind() == Tree.Kind.EQUAL_TO || binary.getKind() == Tree.Kind.NOT_EQUAL_TO;
      case InstanceOfTree check -> true;
      case TryTree resource -> true;
      default -> false;
    };
  }

  private void forward(Body.Use use, Tree call, int position) {
    MethodInfo target = typer.calls.resolve(call, ctx).target();
    int declaredCount = target == null ? 0 : target.params.size() - (target.isVarargs() ? 1 : 0);
    boolean declared = position >= 0 && position < declaredCount;
    if (declared) {
      use.forwards.add(new Body.Forward(target, position));
    } else {
      use.opaque = true;
    }
  }

  public void member(MemberSelectTree select, TreePath path) {
    if (ctx.classDepth > 0) {
      return;
    }
    Tree base = Names.unparen(select.getExpression());
    String member = select.getIdentifier().toString();
    FieldInfo own = Names.isThis(base) ? ctx.owner.field(member) : null;
    if (own != null && !own.isStatic) {
      body.ownFields.add(member);
    }
    Value value = valueOf(base);
    if (value != null && value.ty().type() != null) {
      record(value, memberName(select, path), path);
    }
  }

  private String memberName(MemberSelectTree select, TreePath path) {
    String member = select.getIdentifier().toString();
    Tree parent = path.getParentPath().getLeaf();
    boolean call =
        parent instanceof MethodInvocationTree invocation && invocation.getMethodSelect() == select;
    MethodInfo target = call ? typer.calls.resolve(parent, ctx).target() : null;
    return target != null && target.accessorField != null ? target.accessorField : member;
  }

  private static boolean isWrite(Tree parent, Tree select) {
    return switch (parent) {
      case AssignmentTree assignment -> assignment.getVariable() == select;
      case CompoundAssignmentTree compound -> compound.getVariable() == select;
      case UnaryTree unary -> unary.getExpression() == select && Mutations.isStep(unary);
      default -> false;
    };
  }

  private Value valueOf(Tree base) {
    if (base instanceof IdentifierTree identifier) {
      return identifierValue(identifier.getName().toString());
    }
    boolean ownField =
        base instanceof MemberSelectTree select
            && Names.isThis(Names.unparen(select.getExpression()));
    String name = ownField ? ((MemberSelectTree) base).getIdentifier().toString() : null;
    FieldInfo field = name == null ? null : typer.lookup.field(ctx.owner, name);
    return field == null ? null : fieldValue(field);
  }

  private Value identifierValue(String name) {
    if (name.equals("this") || name.equals("super")) {
      return null;
    }
    Local local = ctx.lookup(name);
    if (local != null) {
      return new Value(local.key, local.ty, local.param);
    }
    FieldInfo field = typer.lookup.bareField(name, ctx.owner);
    return field == null ? null : fieldValue(field);
  }

  private Value fieldValue(FieldInfo field) {
    return new Value("this." + field.name, typer.fieldType(field), -1);
  }

  private void record(Value value, String name, TreePath path) {
    Tree site = path.getLeaf();
    boolean write = isWrite(path.getParentPath().getLeaf(), site);
    TypeInfo type = value.ty().type();
    String kind = type.designKind;
    boolean shaped = "class".equals(kind) || "data".equals(kind);
    if (value.param() >= 0 && (shaped || "interface".equals(kind))) {
      Body.Use use = body.uses.get(value.param());
      if (use != null) {
        use.fields.add(name);
        use.opaque |= closureDepth > 0;
      }
    }
    if (shaped && !write) {
      Body.Read read =
          body.reads.computeIfAbsent(value.key(), key -> new Body.Read(type, ctx.unit.line(site)));
      read.fields.add(name);
      if (conditionDepth > 0) {
        read.decided.add(name);
      }
    }
  }

  public void captured(Set<String> names) {
    for (String name : names) {
      Local local = ctx.lookup(name);
      Body.Use use = local == null ? null : body.uses.get(local.param);
      if (use != null) {
        use.opaque = true;
      }
      FieldInfo field = ctx.owner.field(name);
      if (local == null && field != null && !field.isStatic) {
        body.ownFields.add(name);
      }
    }
  }
}
