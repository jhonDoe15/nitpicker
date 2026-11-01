package nitpicker.kotlinpsi.catches;

import static nitpicker.kotlinpsi.common.Psi.clip;
import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntUnaryOperator;
import nitpicker.kotlinpsi.bodies.Throwing;
import org.jetbrains.kotlin.psi.KtCatchClause;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtFinallySection;
import org.jetbrains.kotlin.psi.KtParameter;
import org.jetbrains.kotlin.psi.KtTryExpression;

public final class Catches {
  private Catches() {}

  public static List<Object> completing(
      KtTryExpression tryExpression, IntUnaryOperator lineOf, String symbol, Throwing throwing) {
    List<Object> found = new ArrayList<>();
    for (KtCatchClause clause : tryExpression.getCatchClauses()) {
      KtParameter parameter = clause.getCatchParameter();
      KtExpression body = clause.getCatchBody();
      if (parameter == null || parameter.getTypeReference() == null || body == null
          || parameter.getName() == null) {
        continue;
      }
      String name = parameter.getName();
      KtFinallySection section = tryExpression.getFinallyBlock();
      boolean cancellation = Coroutines.suspending(clause)
          && new Handler(name, true, new Handling(name, true, throwing)).completes(clause, section);
      boolean interrupt = new Handler(name, false, new Handling(name, false, throwing)).completes(clause, section);
      if (cancellation || interrupt) {
        found.add(
            m(
                "line", lineOf.applyAsInt(clause.getTextOffset()), "symbol", symbol,
                "type", clip(parameter.getTypeReference()), "name", name,
                "cancellation", cancellation, "interrupt", interrupt));
      }
    }
    return found;
  }
}
