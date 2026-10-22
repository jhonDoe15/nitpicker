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

/**
 * Facts about the main sources that tell the Nitpicker side which mutants of PIT's report hit code the Kotlin
 * compiler wrote (coroutine state machines, null-check intrinsics, copies of inline bodies, accessors and members
 * of data and value classes, bridges). One entry per file, lines 1-based:
 *
 * <pre>
 * file, package, lines   path from the project directory, package, number of lines
 * classes                every named class, object and interface (nested ones with $ in the JVM name) and the
 *                        class of the top-level declarations: name, kind, start and headerEnd (the lines of the
 *                        declaration up to its body), init, serializable, functions (names written in its
 *                        body), properties (name, start, end, constructor, getter and setter written with a
 *                        body, delegated)
 * functions              every named function with a body: name, class, start, end, suspend, inline,
 *                        returnsUnit, inlineCalls (names of the project's inline functions it calls), staticIn
 *                        (the class that gets the static bridge of a @JvmStatic function of a companion)
 * lambdas                every lambda: start, end, valueLines, returnLines, callee, discarded, unitCallee
 * branching              lines that hold syntax the compiler turns into a conditional
 * bang                   first and last line of each expression that holds !!
 * </pre>
 */
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
        "bang", branching.bangLines());
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
