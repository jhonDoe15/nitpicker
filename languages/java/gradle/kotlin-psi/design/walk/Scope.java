package nitpicker.kotlinpsi.design.walk;

import nitpicker.kotlinpsi.design.Ctx;
import nitpicker.kotlinpsi.design.model.Fun;
import nitpicker.kotlinpsi.design.model.Prop;
import nitpicker.kotlinpsi.design.model.Ty;
import nitpicker.kotlinpsi.design.resolve.Binding;
import nitpicker.kotlinpsi.design.syntax.Ps;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

/** Answers questions about the expressions of one function: which parameter or field they name, where they escape. */
public final class Scope {
  public static final class Value {
    public final Object id;
    public final Ty type;
    public final int param;

    public Value(Object id, Ty type, int param) {
      this.id = id;
      this.type = type;
      this.param = param;
    }
  }

  private final Ctx ctx;
  private final Fun function;

  public Scope(Ctx ctx, Fun function) {
    this.ctx = ctx;
    this.function = function;
  }

  public boolean neutral(KtNameReferenceExpression ref) {
    PsiElement parent = ref.getParent();
    while (parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    if (parent instanceof KtIsExpression) {
      return true;
    }
    if (parent instanceof KtBinaryExpression) {
      KtBinaryExpression binary = (KtBinaryExpression) parent;
      Object token = binary.getOperationToken();
      boolean equality = token == KtTokens.EQEQ || token == KtTokens.EXCLEQ || token == KtTokens.EQEQEQ
          || token == KtTokens.EXCLEQEQEQ;
      KtExpression other = Ps.parens(binary.getLeft()) == ref ? binary.getRight() : binary.getLeft();
      return equality && Ps.parens(other) instanceof KtConstantExpression
          && Ps.parens(other).getNode().getElementType() == org.jetbrains.kotlin.KtNodeTypes.NULL;
    }
    return false;
  }
  public int parameterOf(KtNameReferenceExpression ref) {
    Binding binding = ctx.bindings.bind(ref);
    return binding.kind == Binding.Kind.LOCAL ? paramIndex(binding.declaration) : -1;
  }
  public int paramIndex(PsiElement declaration) {
    for (int i = 0; i < function.params.size(); i++) {
      if (function.params.get(i) == declaration) {
        return i;
      }
    }
    return -1;
  }
  public Prop thisField(KtExpression expression) {
    KtExpression e = Ps.strip(expression);
    if (!(e instanceof KtDotQualifiedExpression)) {
      return null;
    }
    KtDotQualifiedExpression q = (KtDotQualifiedExpression) e;
    KtExpression receiver = Ps.strip(q.getReceiverExpression());
    if (receiver instanceof KtThisExpression && q.getSelectorExpression() instanceof KtNameReferenceExpression
        && ctx.typer.typeOf(receiver).owner == function.owner && !function.owner.module()) {
      KtExpression selector = q.getSelectorExpression();
      return ctx.members.prop(function.owner, ((KtNameReferenceExpression) selector).getReferencedName());
    }
    return null;
  }
  public Value value(KtExpression expression) {
    KtExpression e = Ps.strip(expression);
    if (e instanceof KtNameReferenceExpression) {
      Binding binding = ctx.bindings.bind((KtNameReferenceExpression) e);
      if (binding.kind == Binding.Kind.LOCAL) {
        Ty type = ctx.typer.localType(binding.declaration);
        return new Value(binding.declaration, type, paramIndex(binding.declaration));
      }
      if (binding.kind == Binding.Kind.FIELD && !binding.receiver) {
        return new Value(binding.prop, ctx.typer.propType(binding.prop), -1);
      }
      return null;
    }
    Prop prop = thisField(e);
    return prop == null ? null : new Value(prop, ctx.typer.propType(prop), -1);
  }
  public boolean escapes(PsiElement node) {
    for (PsiElement p = node.getParent(); p != null && p != function.psi; p = p.getParent()) {
      if (p instanceof KtLambdaExpression && !ctx.lambdas.transparent((KtLambdaExpression) p)
          || p instanceof KtObjectLiteralExpression || p instanceof KtNamedFunction
          || p instanceof KtClassOrObject && ctx.index.byPsi.get(p) == null) {
        return true;
      }
    }
    return false;
  }
}
