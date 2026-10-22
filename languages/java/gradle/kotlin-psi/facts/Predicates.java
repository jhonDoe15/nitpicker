package nitpicker.kotlinpsi.facts;

import static nitpicker.kotlinpsi.common.Psi.*;

import java.util.*;
import nitpicker.kotlinpsi.common.Frame;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

final class Predicates {
  private static final Set<String> COLLECTION_FACTORIES =
      Set.of("setOf", "listOf", "arrayOf", "hashSetOf", "linkedSetOf", "sortedSetOf", "enumSetOf", "of");

  private final State state;

  Predicates(State state) {
    this.state = state;
  }

  private String symbolAt(Frame frame, PsiElement at) {
    Frame function = frame == null ? null : frame.nearest("fun");
    Frame owner = frame == null ? null : frame.nearest("class");
    List<String> parts = new ArrayList<>();
    if (owner != null) {
      parts.add((String) owner.data.get("qualified"));
    }
    String name = function != null ? (String) function.data.get("name") : propertyAround(at);
    if (name != null) {
      parts.add(name);
    }
    return String.join(".", parts);
  }

  private String propertyAround(PsiElement at) {
    for (PsiElement parent = at.getParent(); parent != null; parent = parent.getParent()) {
      if (parent instanceof KtClassOrObject || parent instanceof KtAnonymousInitializer) {
        return null;
      }
      if (parent instanceof KtProperty && !((KtProperty) parent).isLocal()) {
        return ((KtProperty) parent).getName();
      }
    }
    return null;
  }

  private boolean stable(KtExpression expression) {
    KtExpression plain = KtPsiUtil.safeDeparenthesize(expression);
    if (plain instanceof KtNameReferenceExpression || plain instanceof KtThisExpression) {
      return true;
    }
    return plain instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) plain).getSelectorExpression() instanceof KtNameReferenceExpression
        && stable(((KtDotQualifiedExpression) plain).getReceiverExpression());
  }

  private String holder(PsiElement start) {
    PsiElement child = start;
    PsiElement parent = start.getParent();
    while (parent instanceof KtParenthesizedExpression
        || isIfCondition(parent, child)
        || (parent instanceof KtBinaryExpression && isLogical((KtBinaryExpression) parent))
        || (parent instanceof KtPrefixExpression
            && ((KtPrefixExpression) parent).getOperationToken() == KtTokens.EXCL)) {
      child = parent instanceof KtContainerNode ? parent.getParent() : parent;
      parent = child.getParent();
    }
    if (parent instanceof KtReturnExpression) {
      return "return";
    }
    if (parent instanceof KtProperty && ((KtProperty) parent).getInitializer() == child) {
      return "variable";
    }
    if (parent instanceof KtDeclarationWithBody && ((KtDeclarationWithBody) parent).getBodyExpression() == child) {
      return "return";
    }
    if (parent instanceof KtBlockExpression && parent.getParent() instanceof KtFunctionLiteral
        && isLast((KtBlockExpression) parent, child)) {
      return "lambda";
    }
    if (parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getOperationToken() == KtTokens.EQ
        && ((KtBinaryExpression) parent).getRight() == child) {
      return "assign";
    }
    return "other";
  }

  private boolean isIfCondition(PsiElement parent, PsiElement child) {
    return parent instanceof KtContainerNode && parent.getParent() instanceof KtIfExpression
        && ((KtIfExpression) parent.getParent()).getElse() != null
        && ((KtIfExpression) parent.getParent()).getCondition() == child;
  }

  private boolean isLast(KtBlockExpression block, PsiElement child) {
    List<KtExpression> statements = block.getStatements();
    return statements.get(statements.size() - 1) == child;
  }

  private boolean isLogical(KtBinaryExpression expression) {
    return expression.getOperationToken() == KtTokens.OROR || expression.getOperationToken() == KtTokens.ANDAND;
  }

  private void operands(KtExpression expression, Object token, List<KtExpression> leaves) {
    KtExpression plain = KtPsiUtil.safeDeparenthesize(expression);
    if (plain instanceof KtBinaryExpression && ((KtBinaryExpression) plain).getOperationToken() == token) {
      operands(((KtBinaryExpression) plain).getLeft(), token, leaves);
      operands(((KtBinaryExpression) plain).getRight(), token, leaves);
    } else {
      leaves.add(plain);
    }
  }

  void binary(KtBinaryExpression expression, Frame frame) {
    Object token = expression.getOperationToken();
    if (state.test) {
      return;
    }
    if (isLogical(expression)) {
      PsiElement parent = expression.getParent();
      while (parent instanceof KtParenthesizedExpression) {
        parent = parent.getParent();
      }
      if (parent instanceof KtBinaryExpression && ((KtBinaryExpression) parent).getOperationToken() == token) {
        return;
      }
      chain(expression, token, frame);
    } else if (token == KtTokens.IN_KEYWORD || token == KtTokens.NOT_IN) {
      membership(expression, expression.getLeft(), expression.getRight(), frame);
    }
  }

  private void chain(KtBinaryExpression expression, Object token, Frame frame) {
    List<KtExpression> leaves = new ArrayList<>();
    operands(expression, token, leaves);
    Set<Object> wanted = token == KtTokens.OROR
        ? Set.of(KtTokens.EQEQ, KtTokens.EQEQEQ) : Set.of(KtTokens.EXCLEQ, KtTokens.EXCLEQEQEQ);
    List<Object> comparisons = new ArrayList<>();
    for (KtExpression leaf : leaves) {
      if (!(leaf instanceof KtBinaryExpression) || !wanted.contains(((KtBinaryExpression) leaf).getOperationToken())
          || ((KtBinaryExpression) leaf).getLeft() == null || ((KtBinaryExpression) leaf).getRight() == null) {
        return;
      }
      KtBinaryExpression comparison = (KtBinaryExpression) leaf;
      comparisons.add(
          m(
              "left", clip(comparison.getLeft()), "leftStable", stable(comparison.getLeft()),
              "right", clip(comparison.getRight()), "rightStable", stable(comparison.getRight())));
    }
    state.predicates.add(
        m("kind", "chain", "line", state.lineOf(expression.getTextRange().getStartOffset()),
            "symbol", symbolAt(frame, expression),
            "negated", token == KtTokens.ANDAND, "holder", holder(expression), "comparisons", comparisons));
  }

  private void membership(PsiElement at, KtExpression subject, KtExpression collection, Frame frame) {
    KtExpression plain = collection == null ? null : KtPsiUtil.safeDeparenthesize(collection);
    KtCallExpression call = null;
    if (plain instanceof KtCallExpression) {
      call = (KtCallExpression) plain;
    } else if (plain instanceof KtDotQualifiedExpression
        && ((KtDotQualifiedExpression) plain).getSelectorExpression() instanceof KtCallExpression) {
      call = (KtCallExpression) ((KtDotQualifiedExpression) plain).getSelectorExpression();
    }
    if (call == null || subject == null || !COLLECTION_FACTORIES.contains(nameOf(call.getCalleeExpression()))) {
      return;
    }
    List<Object> elements = new ArrayList<>();
    for (ValueArgument argument : call.getValueArguments()) {
      elements.add(clip(argument.getArgumentExpression()));
    }
    state.predicates.add(
        m("kind", "membership", "line", state.lineOf(at.getTextRange().getStartOffset()), "symbol", symbolAt(frame, at),
            "holder", holder(at),
            "subject", clip(subject), "subjectStable", stable(subject), "elements", elements,
            "factory", plain instanceof KtDotQualifiedExpression
                ? clip(((KtDotQualifiedExpression) plain).getReceiverExpression()) : null));
  }

  void containsForm(KtDotQualifiedExpression expression, Frame frame) {
    if (state.test || !(expression.getSelectorExpression() instanceof KtCallExpression)) {
      return;
    }
    KtCallExpression selector = (KtCallExpression) expression.getSelectorExpression();
    if (!"contains".equals(nameOf(selector.getCalleeExpression())) || selector.getValueArguments().size() != 1) {
      return;
    }
    membership(expression, selector.getValueArguments().get(0).getArgumentExpression(),
        expression.getReceiverExpression(), frame);
  }
}
