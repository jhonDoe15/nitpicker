package nitpicker.designfacts.scan;

import com.sun.source.tree.*;
import com.sun.source.util.TreePathScanner;
import com.sun.source.util.TreeScanner;
import java.util.*;
import nitpicker.designfacts.model.*;
import nitpicker.designfacts.resolve.*;
import nitpicker.designfacts.scope.*;

abstract class ScopeScanner extends TreePathScanner<Void, Void> {
  protected final Typer typer;
  protected final Ctx ctx;
  protected final Usage usage;

  ScopeScanner(Typer typer, Ctx ctx, Usage usage) {
    this.typer = typer;
    this.ctx = ctx;
    this.usage = usage;
  }

  protected final void conditioned(Tree condition) {
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
}
