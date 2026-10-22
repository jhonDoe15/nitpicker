package nitpicker.kotlinpsi.common;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.psi.*;

public final class Psi {
  private static final int TEXT_LIMIT = 200;

  private Psi() {}

  public static Map<String, Object> m(Object... pairs) {
    Map<String, Object> map = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) {
      map.put((String) pairs[i], pairs[i + 1]);
    }
    return map;
  }

  public static String clip(String text, int limit) {
    String flat = text.replaceAll("\\s+", " ").trim();
    return flat.length() > limit ? flat.substring(0, limit) : flat;
  }

  public static String clip(PsiElement element) {
    return element == null ? null : clip(element.getText(), TEXT_LIMIT);
  }

  public static String nameOf(PsiElement element) {
    return element instanceof KtSimpleNameExpression
        ? ((KtSimpleNameExpression) element).getReferencedName()
        : null;
  }

  public static List<String> annotationNames(KtAnnotated annotated) {
    List<String> names = new ArrayList<>();
    for (KtAnnotationEntry entry : annotated.getAnnotationEntries()) {
      if (entry.getShortName() != null) {
        names.add(entry.getShortName().asString());
      }
    }
    return names;
  }

  public static List<Object> annotationTexts(KtAnnotated annotated) {
    List<Object> texts = new ArrayList<>();
    for (KtAnnotationEntry entry : annotated.getAnnotationEntries()) {
      if (entry.getShortName() != null) {
        texts.add(m("name", entry.getShortName().asString(), "arguments", annotationArguments(entry)));
      }
    }
    return texts;
  }

  private static List<Object> annotationArguments(KtAnnotationEntry entry) {
    List<Object> list = new ArrayList<>();
    for (ValueArgument argument : entry.getValueArguments()) {
      list.add(
          m(
              "name", argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString(),
              "text", clip(argument.getArgumentExpression())));
    }
    return list;
  }

  public static List<Object> arguments(KtCallExpression call) {
    List<Object> list = new ArrayList<>();
    for (ValueArgument argument : call.getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      list.add(
          m(
              "name", argument.getArgumentName() == null ? null : argument.getArgumentName().getAsName().asString(),
              "text", clip(expression), "spread", argument.getSpreadElement() != null,
              "lambda", argument instanceof KtLambdaArgument));
    }
    return list;
  }
}
