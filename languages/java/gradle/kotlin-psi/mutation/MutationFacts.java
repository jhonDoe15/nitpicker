package nitpicker.kotlinpsi.mutation;

import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.KtFile;
import org.jetbrains.kotlin.psi.KtLambdaExpression;
import org.jetbrains.kotlin.psi.KtNamedFunction;

public final class MutationFacts {
  private final Set<String> inline = new HashSet<>();
  private final Map<String, Boolean> unitCallees = new HashMap<>();

  public MutationFacts(List<KtFile> files) {
    for (KtFile file : files) {
      for (KtNamedFunction function : PsiTreeUtil.findChildrenOfType(file, KtNamedFunction.class)) {
        index(function);
      }
    }
  }

  private void index(KtNamedFunction function) {
    if (function.getName() == null) {
      return;
    }
    if (function.hasModifier(KtTokens.INLINE_KEYWORD)) {
      inline.add(function.getName());
    }
    unitCallees.merge(function.getName(), Functions.takesUnitLambda(function), (a, b) -> a && b);
  }

  public Map<String, Object> describe(KtFile file, String text, String relative) {
    Spans spans = new Spans(text);
    Functions functions = new Functions(spans, inline);
    Classes classes = new Classes(spans, functions);
    classes.declareFile(file);
    Lambdas lambdas = new Lambdas(spans, unitCallees);
    Branching branching = new Branching(spans, inline);
    scan(file, branching, lambdas);
    return m(
        "file", relative,
        "package", file.getPackageFqName().asString(),
        "lines", spans.count(),
        "classes", classes.entries,
        "functions", functions.entries,
        "lambdas", lambdas.entries,
        "branching", branching.branchingLines(),
        "casts", branching.castLines());
  }

  private void scan(PsiElement element, Branching branching, Lambdas lambdas) {
    branching.visit(element);
    if (element instanceof KtLambdaExpression) {
      lambdas.add((KtLambdaExpression) element);
    }
    for (PsiElement child : element.getChildren()) {
      scan(child, branching, lambdas);
    }
  }
}
