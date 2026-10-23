package nitpicker.kotlinpsi.mutation;

import static nitpicker.kotlinpsi.common.Psi.annotationNames;
import static nitpicker.kotlinpsi.common.Psi.m;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.KtAnnotationEntry;
import org.jetbrains.kotlin.psi.KtCallExpression;
import org.jetbrains.kotlin.psi.KtExpression;
import org.jetbrains.kotlin.psi.KtFunctionType;
import org.jetbrains.kotlin.psi.KtNamedFunction;
import org.jetbrains.kotlin.psi.KtParameter;
import org.jetbrains.kotlin.psi.KtProperty;
import org.jetbrains.kotlin.psi.KtPropertyAccessor;
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
            "jvmName", jvmName(function),
            "class", owner,
            "start", spans.firstLine(function),
            "end", spans.lastLine(function),
            "suspend", function.hasModifier(KtTokens.SUSPEND_KEYWORD),
            "inline", function.hasModifier(KtTokens.INLINE_KEYWORD),
            "returnsUnit", returnsUnit(function),
            "inlineCalls", inlineCalls(function),
            "staticIn", jvmStatic ? staticOwner : null));
  }

  void declareAccessors(KtProperty property, String owner) {
    boolean inlineProperty = property.hasModifier(KtTokens.INLINE_KEYWORD);
    String name = String.valueOf(property.getName());
    boolean booleanForm = name.matches("^is[A-Z_].*");
    accessor(property.getGetter(), booleanForm ? name : "get" + capitalized(name), owner, inlineProperty);
    accessor(
        property.getSetter(),
        "set" + capitalized(booleanForm ? name.substring(2) : name),
        owner,
        inlineProperty);
  }

  private void accessor(KtPropertyAccessor accessor, String name, String owner, boolean inlineProperty) {
    boolean inline = accessor != null && (inlineProperty || accessor.hasModifier(KtTokens.INLINE_KEYWORD));
    if (!inline || !accessor.hasBody()) {
      return;
    }
    entries.add(
        m(
            "name", name,
            "class", owner,
            "start", spans.firstLine(accessor),
            "end", spans.lastLine(accessor),
            "suspend", false,
            "inline", true,
            "returnsUnit", false,
            "inlineCalls", List.of()));
  }

  private String capitalized(String name) {
    return name.isEmpty() ? name : Character.toUpperCase(name.charAt(0)) + name.substring(1);
  }

  private String jvmName(KtNamedFunction function) {
    for (KtAnnotationEntry entry : function.getAnnotationEntries()) {
      boolean named = entry.getShortName() != null && "JvmName".equals(entry.getShortName().asString());
      if (named && !entry.getValueArguments().isEmpty()) {
        KtExpression value = entry.getValueArguments().get(0).getArgumentExpression();
        return value == null ? null : value.getText().replace("\"", "");
      }
    }
    return null;
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
