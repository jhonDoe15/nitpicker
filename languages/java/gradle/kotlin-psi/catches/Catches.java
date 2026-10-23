package nitpicker.kotlinpsi.catches;

import static nitpicker.kotlinpsi.common.Psi.clip;
import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntUnaryOperator;
import org.jetbrains.kotlin.psi.KtCatchClause;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtParameter;
import org.jetbrains.kotlin.psi.KtTryExpression;

public final class Catches {
  private static final List<String> CANCELLATION_HANDLING = List.of("ensureActive");
  private static final List<String> INTERRUPT_HANDLING = List.of("interrupt");

  private Catches() {}

  public static List<Object> completing(
      KtTryExpression tryExpression, IntUnaryOperator lineOf, String symbol) {
    List<Object> found = new ArrayList<>();
    for (KtCatchClause clause : tryExpression.getCatchClauses()) {
      KtParameter parameter = clause.getCatchParameter();
      KtExpression body = clause.getCatchBody();
      if (parameter == null || parameter.getTypeReference() == null || body == null
          || parameter.getName() == null) {
        continue;
      }
      String name = parameter.getName();
      boolean cancellation = new Handler(name, CANCELLATION_HANDLING, true).flow(body).completes();
      boolean interrupt = new Handler(name, INTERRUPT_HANDLING, false).flow(body).completes();
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
