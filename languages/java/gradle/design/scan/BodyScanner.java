package nitpicker.designfacts.scan;

import com.sun.source.tree.*;
import com.sun.source.util.TreePath;
import java.util.*;
import nitpicker.designfacts.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;
import nitpicker.designfacts.scope.*;

public final class BodyScanner extends ScopeScanner {
  private final Body body;
  private final MethodInfo method;
  private final Decisions decisions;
  private final Arity arity;
  private final Mutations mutations;
  private final Set<Tree> chainTails = Collections.newSetFromMap(new IdentityHashMap<>());
  private final Set<Tree> consumed = Collections.newSetFromMap(new IdentityHashMap<>());
  private int finallyDepth;

  public BodyScanner(Body body, Typer typer, Ctx ctx) {
    super(typer, ctx, new Usage(body, typer, ctx));
    this.body = body;
    this.method = ctx.method;
    this.decisions = new Decisions(typer, ctx);
    this.arity = new Arity(typer, ctx);
    this.mutations = new Mutations(typer, ctx, ctx.method.tree.getBody());
  }

  public void run() {
    TreePath path = new TreePath(ctx.unit.tree);
    Deque<TypeInfo> owners = new ArrayDeque<>();
    for (TypeInfo type = method.owner; type != null; type = type.outer) {
      owners.push(type);
    }
    for (TypeInfo type : owners) {
      path = new TreePath(path, type.tree);
    }
    scan(new TreePath(new TreePath(path, method.tree), method.tree.getBody()), null);
    body.calls.sort(Comparator.comparingLong(fact -> fact.position));
  }

  @Override
  public Void visitVariable(VariableTree tree, Void unused) {
    Tree initializer = tree.getInitializer();
    scan(initializer, null);
    Tree type = tree.getType();
    boolean inferred =
        type == null || (type instanceof IdentifierTree id && id.getName().contentEquals("var"));
    String name = tree.getName().toString();
    ctx.declare(name, inferred ? typer.typeOf(initializer, ctx) : typer.tyOf(type, ctx), -1);
    mutations.declared(name, initializer);
    return null;
  }

  @Override
  public Void visitIf(IfTree tree, Void unused) {
    if (!chainTails.contains(tree)) {
      body.decisions.addAll(decisions.chain(tree, chainTails, consumed));
    }
    conditioned(tree.getCondition());
    scan(tree.getThenStatement(), null);
    scan(tree.getElseStatement(), null);
    return null;
  }

  @Override
  public Void visitSwitch(SwitchTree tree, Void unused) {
    return selection(tree, tree.getExpression(), tree.getCases());
  }

  @Override
  public Void visitSwitchExpression(SwitchExpressionTree tree, Void unused) {
    return selection(tree, tree.getExpression(), tree.getCases());
  }

  private Void selection(Tree tree, ExpressionTree selector, List<? extends CaseTree> cases) {
    Map<String, Object> decision = decisions.selection(selector, cases, ctx.unit.line(tree));
    if (decision != null) {
      body.decisions.add(decision);
    }
    conditioned(selector);
    ctx.push();
    scan(cases, null);
    ctx.pop();
    return null;
  }

  @Override
  public Void visitBinary(BinaryTree tree, Void unused) {
    boolean disjunction = tree.getKind() == Tree.Kind.CONDITIONAL_OR;
    boolean logical = disjunction || tree.getKind() == Tree.Kind.CONDITIONAL_AND;
    if (disjunction && !consumed.contains(tree)) {
      Map<String, Object> decision = decisions.disjunction(tree, consumed);
      if (decision != null) {
        body.decisions.add(decision);
      }
    }
    usage.conditionDepth += logical ? 1 : 0;
    super.visitBinary(tree, unused);
    usage.conditionDepth -= logical ? 1 : 0;
    return null;
  }

  @Override
  public Void visitTry(TryTree tree, Void unused) {
    ctx.push();
    for (Tree resource : tree.getResources()) {
      scan(resource, null);
      closing(resource, tree.getBlock());
    }
    scan(tree.getBlock(), null);
    ctx.pop();
    scan(tree.getCatches(), null);
    if (tree.getFinallyBlock() != null) {
      finallyDepth++;
      scan(tree.getFinallyBlock(), null);
      finallyDepth--;
    }
    return null;
  }

  private void closing(Tree resource, Tree block) {
    Ty ty;
    String key;
    if (resource instanceof VariableTree variable) {
      Local local = ctx.lookup(variable.getName().toString());
      ty = local == null ? Ty.UNKNOWN : local.ty;
      key = variable.getName().toString();
    } else {
      ty = typer.typeOf(resource, ctx);
      key = typer.keyOf(resource, ctx);
    }
    MethodInfo close = ty.type() == null ? null : typer.lookup.method(ty.type(), "close", 0).method();
    if (close != null) {
      body.calls.add(
          new Body.CallFact(new Body.Call(close, ctx.unit.line(resource), key, true, ctx.unit.end(block))));
    }
  }

  @Override
  public Void visitReturn(ReturnTree tree, Void unused) {
    if (usage.closureDepth == 0 && tree.getExpression() != null && body.returnsField == null) {
      body.returnsField = returned(tree.getExpression());
    }
    return super.visitReturn(tree, unused);
  }

  private String returned(Tree expression) {
    Tree e = Names.unwrap(expression);
    if (e instanceof ConditionalExpressionTree conditional) {
      String found = returned(conditional.getTrueExpression());
      return found != null ? found : returned(conditional.getFalseExpression());
    }
    FieldInfo field = typer.fieldRef(e, ctx);
    boolean own = field != null && field.owner == ctx.owner && !field.isStatic;
    return own && (e instanceof IdentifierTree || e instanceof MemberSelectTree) ? field.name : null;
  }

  @Override
  public Void visitMethodInvocation(MethodInvocationTree tree, Void unused) {
    Calls.Resolved resolved = typer.calls.resolve(tree, ctx);
    if (resolved.target() != null) {
      record(tree, resolved, positionOf(tree));
    }
    mutations.invoked(tree);
    return super.visitMethodInvocation(tree, unused);
  }

  @Override
  public Void visitNewClass(NewClassTree tree, Void unused) {
    Calls.Resolved resolved = typer.calls.resolve(tree, ctx);
    if (resolved.target() != null) {
      record(tree, resolved, ctx.unit.start(tree));
    }
    return super.visitNewClass(tree, unused);
  }

  private long positionOf(MethodInvocationTree tree) {
    if (tree.getMethodSelect() instanceof MemberSelectTree select) {
      return ctx.unit.end(select) - select.getIdentifier().length();
    }
    return ctx.unit.start(tree);
  }

  private void record(Tree tree, Calls.Resolved resolved, long position) {
    boolean cleanup = finallyDepth > 0 && usage.closureDepth == 0;
    Body.CallFact fact =
        new Body.CallFact(
            new Body.Call(resolved.target(), ctx.unit.lineAt(position), resolved.receiver(), cleanup, position));
    mutations.register(tree, fact);
    body.calls.add(fact);
  }

  @Override
  public Void visitAssignment(AssignmentTree tree, Void unused) {
    mutations.assigned(tree.getVariable());
    return super.visitAssignment(tree, unused);
  }

  @Override
  public Void visitCompoundAssignment(CompoundAssignmentTree tree, Void unused) {
    mutations.assigned(tree.getVariable());
    return super.visitCompoundAssignment(tree, unused);
  }

  @Override
  public Void visitUnary(UnaryTree tree, Void unused) {
    if (Mutations.isStep(tree)) {
      mutations.assigned(tree.getExpression());
    }
    return super.visitUnary(tree, unused);
  }

  @Override
  public Void visitMemberReference(MemberReferenceTree tree, Void unused) {
    MethodInfo target = typer.references.resolve(tree, ctx, arity.of(getCurrentPath()));
    if (target != null) {
      body.references.add(target);
    }
    return super.visitMemberReference(tree, unused);
  }

  @Override
  public Void visitIdentifier(IdentifierTree tree, Void unused) {
    usage.identifier(tree, getCurrentPath());
    body.references.addAll(typer.references.table(typer.fieldRef(tree, ctx)));
    return null;
  }

  @Override
  public Void visitMemberSelect(MemberSelectTree tree, Void unused) {
    usage.member(tree, getCurrentPath());
    body.references.addAll(typer.references.table(typer.fieldRef(tree, ctx)));
    return super.visitMemberSelect(tree, unused);
  }
}
