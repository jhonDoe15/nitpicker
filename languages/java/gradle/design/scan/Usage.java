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
    if (name.equals("this") || name.equals("super")) {
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
    final Tree child = current.getLeaf();
    final Tree parent = current.getParentPath().getLeaf();
    switch (parent) {
      case MemberSelectTree select when select.getExpression() == child -> {}
      case MethodInvocationTree call -> forward(use, call, call.getArguments().indexOf(child));
      case NewClassTree creation -> forward(use, creation, creation.getArguments().indexOf(child));
      case BinaryTree binary when binary.getKind() == Tree.Kind.EQUAL_TO
          || binary.getKind() == Tree.Kind.NOT_EQUAL_TO -> {}
      case InstanceOfTree check -> {}
      case TryTree resource -> {}
      default -> use.opaque = true;
    }
  }

  private void forward(Body.Use use, Tree call, int position) {
    MethodInfo target = typer.calls.resolve(call, ctx).target();
    boolean declared =
        target != null && position >= 0 && position < target.params.size()
            && !(target.isVarargs() && position >= target.params.size() - 1);
    if (declared) {
      use.forwards.add(new Body.Forward(target, position));
    } else {
      use.opaque = true;
    }
  }

  public void member(MemberSelectTree select, TreePath path) {
    Tree base = Names.unparen(select.getExpression());
    String member = select.getIdentifier().toString();
    if (base instanceof IdentifierTree identifier && identifier.getName().contentEquals("this")) {
      FieldInfo field = ctx.owner.field(member);
      if (field != null && !field.isStatic) {
        body.ownFields.add(member);
      }
    }
    Value value = valueOf(base);
    if (value == null || value.ty().type() == null) {
      return;
    }
    Tree parent = path.getParentPath().getLeaf();
    boolean call = parent instanceof MethodInvocationTree invocation && invocation.getMethodSelect() == select;
    String name = member;
    if (call) {
      MethodInfo target = typer.calls.resolve(parent, ctx).target();
      name = target != null && target.accessorField != null ? target.accessorField : member;
    }
    record(value, name, path);
  }

  private static boolean isWrite(Tree parent, Tree select) {
    return switch (parent) {
      case AssignmentTree assignment -> assignment.getVariable() == select;
      case CompoundAssignmentTree compound -> compound.getVariable() == select;
      case UnaryTree unary -> unary.getExpression() == select && unary.getKind().name().contains("CREMENT");
      default -> false;
    };
  }

  private Value valueOf(Tree base) {
    if (base instanceof IdentifierTree identifier) {
      String name = identifier.getName().toString();
      if (name.equals("this") || name.equals("super")) {
        return null;
      }
      Local local = ctx.lookup(name);
      if (local != null) {
        return new Value(name, local.ty, local.param);
      }
      FieldInfo field = typer.lookup.bareField(name, ctx.owner);
      return field == null ? null : new Value("this." + name, typer.fieldType(field), -1);
    }
    if (base instanceof MemberSelectTree select
        && Names.unparen(select.getExpression()) instanceof IdentifierTree owner
        && owner.getName().contentEquals("this")) {
      FieldInfo field = typer.lookup.field(ctx.owner, select.getIdentifier().toString());
      return field == null ? null : new Value("this." + field.name, typer.fieldType(field), -1);
    }
    return null;
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
