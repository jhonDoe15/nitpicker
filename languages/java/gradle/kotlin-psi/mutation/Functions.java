package nitpicker.kotlinpsi.mutation;

import static nitpicker.kotlinpsi.common.Psi.annotationNames;
import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtFunctionType;
import org.jetbrains.kotlin.psi.KtNamedFunction;
import org.jetbrains.kotlin.psi.KtParameter;
import org.jetbrains.kotlin.psi.KtTypeElement;
import org.jetbrains.kotlin.psi.KtTypeReference;

final class Functions {
  private static final String UNIT = "Unit";

  final List<Object> entries = new ArrayList<>();
  private final Spans spans;
  private final Set<String> projectInline;

  Functions(Spans spans, Set<String> projectInline) {
    this.spans = spans;
    this.projectInline = projectInline;
  }

  static boolean takesUnitLambda(KtNamedFunction function) {
    boolean any = false;
    for (KtParameter parameter : function.getValueParameters()) {
      KtTypeReference type = parameter.getTypeReference();
      KtTypeElement element = type == null ? null : type.getTypeElement();
      if (element instanceof KtFunctionType) {
        KtTypeReference result = ((KtFunctionType) element).getReturnTypeReference();
        if (result == null || !UNIT.equals(result.getText())) {
          return false;
        }
        any = true;
      }
    }
    return any;
  }

  void declare(KtNamedFunction function, String owner, String staticOwner) {
    if (!function.hasBody() || function.getName() == null) {
      return;
    }
    boolean jvmStatic = annotationNames(function).contains("JvmStatic");
    entries.add(
        m(
            "name", function.getName(),
            "class", owner,
            "start", spans.firstLine(function),
            "end", spans.lastLine(function),
            "suspend", function.hasModifier(KtTokens.SUSPEND_KEYWORD),
            "inline", function.hasModifier(KtTokens.INLINE_KEYWORD),
            "returnsUnit", returnsUnit(function),
            "inlineCalls", inlineCalls(function),
            "staticIn", jvmStatic ? staticOwner : null));
  }

  private boolean returnsUnit(KtNamedFunction function) {
    KtTypeReference type = function.getTypeReference();
    return type == null ? function.hasBlockBody() : UNIT.equals(type.getText());
  }

  private List<String> inlineCalls(KtNamedFunction function) {
    Set<String> names = new TreeSet<>();
    for (KtCallExpression call : PsiTreeUtil.findChildrenOfType(function, KtCallExpression.class)) {
      KtExpression callee = call.getCalleeExpression();
      if (callee != null && projectInline.contains(callee.getText())) {
        names.add(callee.getText());
      }
    }
    return new ArrayList<>(names);
  }
}
