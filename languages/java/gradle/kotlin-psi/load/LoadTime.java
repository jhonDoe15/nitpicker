package nitpicker.kotlinpsi.load;

import static nitpicker.kotlinpsi.common.Psi.m;
import static nitpicker.kotlinpsi.common.Psi.nameOf;

import java.util.*;
import java.util.regex.Pattern;
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

  private static final Pattern SEQUENCE = Pattern.compile("\\b(?:asSequence|sequenceOf|generateSequence|sequence)\\b");

  private final Map<KtNamedFunction, Map<String, Object>> helpers = new HashMap<>();
  private final Map<KtClass, List<List<? extends ValueArgument>>> creations = new HashMap<>();

  LoadTime(KtFile file) {
    for (KtCallExpression call : PsiTreeUtil.findChildrenOfType(file, KtCallExpression.class)) {
      String name = nameOf(call.getCalleeExpression());
      Map<String, Object> context = name == null || hasReceiver(call) ? null : walk(call, false);
      KtNamedFunction callee = context == null ? null : Callees.resolve(call, name);
      if (callee != null) {
        helpers.putIfAbsent(callee, context);
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

  static boolean hasReceiver(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression
        && ((KtQualifiedExpression) parent).getSelectorExpression() == call
        && !(((KtQualifiedExpression) parent).getReceiverExpression() instanceof KtThisExpression);
  }

  static boolean isLiteral(PsiElement element) {
    return element instanceof KtObjectDeclaration && ((KtObjectDeclaration) element).isObjectLiteral();
  }

  static boolean deferredBetween(PsiElement start, PsiElement stop) {
    for (PsiElement parent = start.getParent(); parent != null && parent != stop; parent = parent.getParent()) {
      if (isDeferred(parent) || parent instanceof KtNamedFunction || isLiteral(parent)) {
        return true;
      }
    }
    return false;
  }

  private Map<String, Object> walk(PsiElement start, boolean followHelpers) {
    String member = null;
    PsiElement memberElement = null;
    PsiElement child = start;
    for (PsiElement parent = start.getParent(); parent != null; child = parent, parent = parent.getParent()) {
      if (parent instanceof KtNamedFunction) {
        return followHelpers ? helperContext((KtNamedFunction) parent) : null;
      } else if (isDeferred(parent)) {
        return null;
      } else if (isLiteral(parent)) {
        member = null;
      } else if (parent instanceof KtClassOrObject && !(parent instanceof KtEnumEntry)) {
        return ownerContext((KtClassOrObject) parent, member, memberElement);
      } else if (parent instanceof KtFile) {
        return member == null ? null : m("kind", "file", "owner", "", "member", member);
      } else if (member == null) {
        member = memberName(parent, child);
        memberElement = member == null ? null : parent;
      }
    }
    return null;
  }

  private Map<String, Object> helperContext(KtNamedFunction function) {
    Map<String, Object> site = helpers.get(function);
    return site == null ? null
        : m("kind", site.get("kind"), "owner", site.get("owner"), "member", function.getName() + "()",
            "site", site.get("member"));
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
    return call instanceof KtCallExpression && INLINE.contains(nameOf(((KtCallExpression) call).getCalleeExpression()))
        && !onSequence((KtCallExpression) call);
  }

  private static boolean onSequence(KtCallExpression call) {
    PsiElement parent = call.getParent();
    return parent instanceof KtQualifiedExpression && ((KtQualifiedExpression) parent).getSelectorExpression() == call
        && SEQUENCE.matcher(((KtQualifiedExpression) parent).getReceiverExpression().getText()).find();
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

  private Map<String, Object> ownerContext(KtClassOrObject declaration, String member, PsiElement memberElement) {
    if (member == null) {
      return null;
    }
    if (declaration instanceof KtObjectDeclaration) {
      boolean companion = ((KtObjectDeclaration) declaration).isCompanion();
      return m("kind", companion ? "companion" : "object", "owner", qualified(declaration), "member", member);
    }
    if (!(declaration instanceof KtClass)) {
      return null;
    }
    KtClass type = (KtClass) declaration;
    List<List<? extends ValueArgument>> created = creations.computeIfAbsent(type, Creations::of);
    boolean runs = memberElement instanceof KtSecondaryConstructor
        ? Creations.reaches(created, (KtSecondaryConstructor) memberElement)
        : !created.isEmpty();
    return runs ? m("kind", type.isEnum() ? "enum" : "singleton", "owner", qualified(type), "member", member) : null;
  }
}
