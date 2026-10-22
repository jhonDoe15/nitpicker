package nitpicker.kotlinpsi.load;

import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.com.intellij.psi.util.PsiTreeUtil;
import org.jetbrains.kotlin.psi.*;

final class LoadTime {
  private static final Set<String> INLINE =
      Set.of(
          "run", "let", "apply", "also", "with", "use", "takeIf", "takeUnless", "repeat", "synchronized",
          "forEach", "forEachIndexed", "onEach", "map", "mapNotNull", "mapIndexed", "mapValues", "mapKeys",
          "filter", "filterNot", "filterKeys", "filterValues", "flatMap", "associate", "associateBy",
          "associateWith", "groupBy", "buildList", "buildMap", "buildSet", "buildString", "sumOf", "any",
          "all", "none", "first", "firstOrNull", "single", "singleOrNull", "fold", "count", "sortedBy",
          "maxOf", "minOf", "partition", "getOrElse", "ifEmpty", "ifBlank", "runCatching", "requireNotNull",
          "checkNotNull", "require", "check");

  private final Set<String> helpers = new HashSet<>();

  LoadTime(KtFile file) {
    for (KtCallExpression call : PsiTreeUtil.findChildrenOfType(file, KtCallExpression.class)) {
      String name = nameOf(call.getCalleeExpression());
      Map<String, Object> context = name == null || hasReceiver(call) ? null : walk(call, false);
      if (context != null) {
        helpers.add(context.get("owner") + "#" + name);
      }
    }
  }

  Map<String, Object> contextOf(PsiElement element) {
    return walk(element, true);
  }

  static String qualified(KtClassOrObject declaration) {
    List<String> names = new ArrayList<>();
    for (PsiElement e = declaration; e != null; e = e.getParent()) {
      if (e instanceof KtClassOrObject && !isLiteral(e)) {
        String name = ((KtClassOrObject) e).getName();
        names.add(0, name == null ? "Companion" : name);
      }
    }
    return String.join(".", names);
  }

  static String ownerOf(PsiElement element) {
    for (PsiElement e = element.getParent(); e != null; e = e.getParent()) {
      if (e instanceof KtClassOrObject && !isLiteral(e)) {
        return qualified((KtClassOrObject) e);
      }
    }
    return "";
  }

  private static boolean hasReceiver(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) parent).getSelectorExpression() == call
        && !(((KtQualifiedExpression) parent).getReceiverExpression() instanceof KtThisExpression);
  }

  private static boolean isLiteral(PsiElement element) {
    return element instanceof KtObjectDeclaration && ((KtObjectDeclaration) element).isObjectLiteral();
  }

  private Map<String, Object> walk(PsiElement start, boolean followHelpers) {
    String member = null;
    boolean follow = followHelpers;
    PsiElement child = start;
    for (PsiElement parent = start.getParent(); parent != null; child = parent, parent = parent.getParent()) {
      if (parent instanceof KtNamedFunction) {
        if (!follow || !isHelper((KtNamedFunction) parent)) {
          return null;
        }
        member = ((KtNamedFunction) parent).getName() + "()";
        follow = false;
      } else if (isDeferred(parent)) {
        return null;
      } else if (isLiteral(parent)) {
        member = null;
      } else if (parent instanceof KtClassOrObject && !(parent instanceof KtEnumEntry)) {
        return ownerContext((KtClassOrObject) parent, member);
      } else if (parent instanceof KtFile) {
        return member == null ? null : m("kind", "file", "owner", "", "member", member);
      } else if (member == null) {
        member = memberName(parent, child);
      }
    }
    return null;
  }

  private boolean isHelper(KtNamedFunction function) {
    PsiElement container = function.getParent();
    String owner = container instanceof KtFile ? ""
        : container instanceof KtClassBody && container.getParent() instanceof KtClassOrObject
            && !isLiteral(container.getParent()) ? qualified((KtClassOrObject) container.getParent()) : null;
    return owner != null && helpers.contains(owner + "#" + function.getName());
  }

  private static boolean isDeferred(PsiElement element) {
    return element instanceof KtPropertyAccessor
        || element instanceof KtAnnotationEntry
        || (element instanceof KtLambdaExpression && !isInline((KtLambdaExpression) element));
  }

  private static boolean isInline(KtLambdaExpression lambda) {
    PsiElement parent = lambda.getParent();
    while (parent instanceof KtLabeledExpression || parent instanceof KtAnnotatedExpression
        || parent instanceof KtParenthesizedExpression) {
      parent = parent.getParent();
    }
    PsiElement call = parent instanceof KtLambdaArgument ? parent.getParent()
        : parent instanceof KtValueArgument ? parent.getParent().getParent() : null;
    return call instanceof KtCallExpression && INLINE.contains(nameOf(((KtCallExpression) call).getCalleeExpression()));
  }

  private static String memberName(PsiElement parent, PsiElement child) {
    if (parent instanceof KtProperty && !((KtProperty) parent).isLocal()
        && (child == ((KtProperty) parent).getInitializer() || child == ((KtProperty) parent).getDelegate())) {
      return ((KtProperty) parent).getName();
    }
    if (parent instanceof KtClassInitializer) {
      return "init";
    }
    if (parent instanceof KtSecondaryConstructor || parent instanceof KtPrimaryConstructor) {
      return "constructor";
    }
    return parent instanceof KtEnumEntry ? ((KtEnumEntry) parent).getName() : null;
  }

  private static Map<String, Object> ownerContext(KtClassOrObject declaration, String member) {
    if (member == null) {
      return null;
    }
    if (declaration instanceof KtObjectDeclaration) {
      boolean companion = ((KtObjectDeclaration) declaration).isCompanion();
      return m("kind", companion ? "companion" : "object", "owner", qualified(declaration), "member", member);
    }
    if (declaration instanceof KtClass && ((KtClass) declaration).isEnum()) {
      return m("kind", "enum", "owner", qualified(declaration), "member", member);
    }
    return declaration instanceof KtClass && createsItself((KtClass) declaration)
        ? m("kind", "singleton", "owner", qualified(declaration), "member", member)
        : null;
  }

  private static boolean createsItself(KtClass declaration) {
    for (KtObjectDeclaration companion : declaration.getCompanionObjects()) {
      for (KtDeclaration inner : companion.getDeclarations()) {
        if (!(inner instanceof KtProperty) && !(inner instanceof KtClassInitializer)) {
          continue;
        }
        for (KtCallExpression call : PsiTreeUtil.findChildrenOfType(inner, KtCallExpression.class)) {
          if (Objects.equals(nameOf(call.getCalleeExpression()), declaration.getName())
              && PsiTreeUtil.getParentOfType(call, KtLambdaExpression.class, true, KtDeclaration.class) == null
              && !hasReceiver(call)) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
