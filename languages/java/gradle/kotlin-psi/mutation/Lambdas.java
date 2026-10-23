package nitpicker.kotlinpsi.mutation;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.KtBinaryExpression;
import org.jetbrains.kotlin.psi.KtBlockExpression;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtCatchClause;
import org.jetbrains.kotlin.psi.KtContainerNodeForControlStructureBody;
import org.jetbrains.kotlin.psi.KtDeclaration;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtFunctionLiteral;
import org.jetbrains.kotlin.psi.KtIfExpression;
import org.jetbrains.kotlin.psi.KtLambdaArgument;
import org.jetbrains.kotlin.psi.KtLambdaExpression;
import org.jetbrains.kotlin.psi.KtLoopExpression;
import org.jetbrains.kotlin.psi.KtQualifiedExpression;
import org.jetbrains.kotlin.psi.KtReturnExpression;
import org.jetbrains.kotlin.psi.KtTryExpression;
import org.jetbrains.kotlin.psi.KtValueArgument;
import org.jetbrains.kotlin.psi.KtValueArgumentList;
import org.jetbrains.kotlin.psi.KtWhenEntry;

final class Lambdas {
  final List<Object> entries = new ArrayList<>();
  private final Spans spans;
  private final Map<String, Boolean> unitCallees;

  Lambdas(Spans spans, Map<String, Boolean> unitCallees) {
    this.spans = spans;
    this.unitCallees = unitCallees;
  }

  void add(KtLambdaExpression lambda) {
    KtCallExpression call = callOf(lambda);
    KtExpression callee = call == null ? null : call.getCalleeExpression();
    String name = callee == null ? null : callee.getText();
    entries.add(
        m(
            "start", spans.firstLine(lambda),
            "end", spans.lastLine(lambda),
            "valueLines", valueLines(lambda),
            "returnLines", returnLines(lambda),
            "callee", name,
            "discarded", call != null && !valueUsed(qualified(call)),
            "projectCallee", name != null && unitCallees.containsKey(name),
            "unitCallee", name != null && unitCallees.getOrDefault(name, false)));
  }

  private List<Integer> valueLines(KtLambdaExpression lambda) {
    KtFunctionLiteral literal = lambda.getFunctionLiteral();
    KtBlockExpression body = literal.getBodyExpression();
    List<KtExpression> statements = body == null ? List.of() : body.getStatements();
    KtExpression last = statements.isEmpty() ? null : statements.get(statements.size() - 1);
    return producesValue(last) ? List.of(spans.startLine(last), spans.endLine(last)) : List.of();
  }

  private boolean producesValue(KtExpression last) {
    if (last == null || last instanceof KtDeclaration || last instanceof KtLoopExpression) {
      return false;
    }
    return !(last instanceof KtBinaryExpression
        && ((KtBinaryExpression) last).getOperationToken() == KtTokens.EQ);
  }

  private Set<Integer> returnLines(KtLambdaExpression lambda) {
    Set<Integer> lines = new TreeSet<>();
    for (KtReturnExpression expression : PsiTreeUtil.findChildrenOfType(lambda, KtReturnExpression.class)) {
      if (expression.getLabelQualifier() != null) {
        lines.add(spans.startLine(expression));
        lines.add(spans.endLine(expression));
      }
    }
    return lines;
  }

  private KtCallExpression callOf(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    if (parent instanceof KtLambdaArgument || parent instanceof KtValueArgument) {
      PsiElement call = parent.getParent();
      call = call instanceof KtValueArgumentList ? call.getParent() : call;
      return call instanceof KtCallExpression ? (KtCallExpression) call : null;
    }
    return null;
  }

  private PsiElement qualified(KtCallExpression call) {
    PsiElement expression = call;
    while (expression.getParent() instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) expression.getParent()).getSelectorExpression() == expression) {
      expression = expression.getParent();
    }
    return expression;
  }

  private boolean valueUsed(PsiElement expression) {
    PsiElement parent = expression.getParent();
    if (parent instanceof KtBlockExpression) {
      List<KtExpression> statements = ((KtBlockExpression) parent).getStatements();
      return statements.get(statements.size() - 1) == expression && blockValueUsed((KtBlockExpression) parent);
    }
    if (parent instanceof KtContainerNodeForControlStructureBody) {
      return branchValueUsed(parent.getParent());
    }
    if (parent instanceof KtWhenEntry) {
      return valueUsed(parent.getParent());
    }
    return true;
  }

  private boolean branchValueUsed(PsiElement owner) {
    return owner instanceof KtIfExpression ? valueUsed(owner) : !(owner instanceof KtLoopExpression);
  }

  private boolean blockValueUsed(KtBlockExpression block) {
    PsiElement parent = block.getParent();
    if (parent instanceof KtFunctionLiteral) {
      return true;
    }
    if (parent instanceof KtContainerNodeForControlStructureBody) {
      return branchValueUsed(parent.getParent());
    }
    if (parent instanceof KtWhenEntry || parent instanceof KtCatchClause) {
      return valueUsed(parent.getParent());
    }
    return parent instanceof KtTryExpression && valueUsed(parent);
  }
}
