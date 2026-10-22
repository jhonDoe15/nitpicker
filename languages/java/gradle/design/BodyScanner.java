package nitpicker.designfacts;

import com.sun.source.tree.*;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.TreeScanner;
import java.util.*;

final class BodyScanner extends TreePathScanner<Void, Void> {
  private final Body body;
  private final Typer typer;
  private final Ctx ctx;
  private final MethodInfo method;
  private final Usage usage;
  private final Decisions decisions;
  private final Mutations mutations;
  private final Set<Tree> chainTails = Collections.newSetFromMap(new IdentityHashMap<>());
  private final Set<Tree> consumed = Collections.newSetFromMap(new IdentityHashMap<>());
  private int finallyDepth;

  BodyScanner(Body body, Typer typer, Ctx ctx, MethodInfo method) {
    this.body = body;
    this.typer = typer;
    this.ctx = ctx;
    this.method = method;
    this.usage = new Usage(body, typer, ctx);
    this.decisions = new Decisions(typer, ctx);
    this.mutations = new Mutations(typer, ctx, method.tree.getBody());
  }

  void run() {
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

  private void conditioned(Tree condition) {
    if (condition != null) {
      usage.conditionDepth++;
      scan(condition, null);
      usage.conditionDepth--;
    }
  }

  @Override
  public Void visitBlock(BlockTree tree, Void unused) {
    ctx.push();
    super.visitBlock(tree, unused);
    ctx.pop();
    return null;
  }

  @Override
  public Void visitClass(ClassTree tree, Void unused) {
    Set<String> names = new HashSet<>();
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitIdentifier(IdentifierTree identifier, Void unused) {
        names.add(identifier.getName().toString());
        return null;
      }

      @Override
      public Void visitMemberSelect(MemberSelectTree select, Void unused) {
        names.add(select.getIdentifier().toString());
        return super.visitMemberSelect(select, unused);
      }
    }.scan(tree, null);
    usage.captured(names);
    return null;
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
  public Void visitBindingPattern(BindingPatternTree tree, Void unused) {
    VariableTree variable = tree.getVariable();
    ctx.declare(variable.getName().toString(), typer.tyOf(variable.getType(), ctx), -1);
    return null;
  }

  @Override
  public Void visitForLoop(ForLoopTree tree, Void unused) {
    ctx.push();
    scan(tree.getInitializer(), null);
    conditioned(tree.getCondition());
    scan(tree.getUpdate(), null);
    scan(tree.getStatement(), null);
    ctx.pop();
    return null;
  }

  @Override
  public Void visitEnhancedForLoop(EnhancedForLoopTree tree, Void unused) {
    scan(tree.getExpression(), null);
    ctx.push();
    VariableTree variable = tree.getVariable();
    ctx.declare(variable.getName().toString(), typer.tyOf(variable.getType(), ctx), -1);
    scan(tree.getStatement(), null);
    ctx.pop();
    return null;
  }

  @Override
  public Void visitCatch(CatchTree tree, Void unused) {
    ctx.push();
    ctx.declare(tree.getParameter().getName().toString(), Ty.UNKNOWN, -1);
    scan(tree.getBlock(), null);
    ctx.pop();
    return null;
  }

  @Override
  public Void visitLambdaExpression(LambdaExpressionTree tree, Void unused) {
    usage.closureDepth++;
    ctx.push();
    for (VariableTree parameter : tree.getParameters()) {
      ctx.declare(parameter.getName().toString(), typer.tyOf(parameter.getType(), ctx), -1);
    }
    scan(tree.getBody(), null);
    ctx.pop();
    usage.closureDepth--;
    return null;
  }

  @Override
  public Void visitWhileLoop(WhileLoopTree tree, Void unused) {
    conditioned(tree.getCondition());
    scan(tree.getStatement(), null);
    return null;
  }

  @Override
  public Void visitDoWhileLoop(DoWhileLoopTree tree, Void unused) {
    scan(tree.getStatement(), null);
    conditioned(tree.getCondition());
    return null;
  }

  @Override
  public Void visitConditionalExpression(ConditionalExpressionTree tree, Void unused) {
    conditioned(tree.getCondition());
    scan(tree.getTrueExpression(), null);
    scan(tree.getFalseExpression(), null);
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
          new Body.CallFact(close, ctx.unit.line(resource), key, true, ctx.unit.end(block)));
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
            resolved.target(), ctx.unit.lineAt(position), resolved.receiver(), cleanup, position);
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
  public Void visitIdentifier(IdentifierTree tree, Void unused) {
    usage.identifier(tree, getCurrentPath());
    return null;
  }

  @Override
  public Void visitMemberSelect(MemberSelectTree tree, Void unused) {
    usage.member(tree, getCurrentPath());
    return super.visitMemberSelect(tree, unused);
  }
}
