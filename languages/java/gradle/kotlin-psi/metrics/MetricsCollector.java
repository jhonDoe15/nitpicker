package nitpicker.kotlinpsi.metrics;

import java.util.*;
import nitpicker.kotlinpsi.common.Json;
import nitpicker.kotlinpsi.common.Lines;
import org.jetbrains.kotlin.com.intellij.lang.ASTNode;
import org.jetbrains.kotlin.com.intellij.psi.PsiElement;
import org.jetbrains.kotlin.lexer.KtTokens;
import org.jetbrains.kotlin.psi.*;

/** Walks the declarations and reports each unit with the name of its enclosing classes. */
public final class MetricsCollector {
  private final KtFile file;
  private final String relative;
  private final List<String> entries;
  private final Lines lines;

  public MetricsCollector(KtFile file, String text, String relative, List<String> entries) {
    this.file = file;
    this.relative = relative;
    this.entries = entries;
    this.lines = new Lines(text);
  }

  public void collect() {
    for (KtDeclaration declaration : file.getDeclarations()) {
      declare(declaration, "");
    }
  }

  private void declare(KtDeclaration declaration, String owner) {
    if (declaration instanceof KtClassOrObject) {
      klass((KtClassOrObject) declaration, owner);
    } else if (declaration instanceof KtNamedFunction) {
      KtNamedFunction function = (KtNamedFunction) declaration;
      if (function.hasBody()) {
        KtTypeReference receiver = function.getReceiverTypeReference();
        String name = (receiver == null ? "" : receiver.getText() + ".") + function.getName();
        report(function, join(owner, name), function.getBodyExpression());
        nested(function.getBodyExpression(), owner, join(owner, name), inline(function));
        defaults(function, owner, join(owner, name));
      }
    } else if (declaration instanceof KtSecondaryConstructor) {
      KtSecondaryConstructor constructor = (KtSecondaryConstructor) declaration;
      if (constructor.getBodyExpression() instanceof KtBlockExpression) {
        String className = owner.substring(owner.lastIndexOf('.') + 1);
        report(constructor, join(owner, className), constructor.getBodyExpression());
        nested(constructor.getBodyExpression(), owner, join(owner, className), false);
        defaults(constructor, owner, join(owner, className));
      }
    } else if (declaration instanceof KtProperty) {
      property((KtProperty) declaration, owner);
    }
  }

  private void defaults(KtDeclarationWithBody declaration, String owner, String scope) {
    for (KtParameter parameter : declaration.getValueParameters()) {
      nested(parameter.getDefaultValue(), owner, scope, false);
    }
  }

  private void initializer(KtClassInitializer initializer, String owner) {
    KtExpression body = initializer.getBody();
    if (body instanceof KtBlockExpression && !((KtBlockExpression) body).getStatements().isEmpty()) {
      report(initializer, join(owner, "<init>"), body, 0, false, true);
    }
    nested(body, owner, join(owner, "<init>"), false);
  }

  private void property(KtProperty property, String owner) {
    for (KtPropertyAccessor accessor : property.getAccessors()) {
      if (accessor.hasBody()) {
        String kind = accessor.isGetter() ? "get" : "set";
        String name = join(owner, property.getName() + "." + kind);
        report(accessor, name, accessor.getBodyExpression());
        nested(accessor.getBodyExpression(), owner, name, inline(accessor));
      }
    }
    String name = join(owner, property.getName());
    KtFunction unit = unitOf(property);
    if (unit != null && unit.getBodyExpression() != null) {
      report(property, name, unit.getBodyExpression(), unit.getValueParameters().size(), false, false, true);
    } else if (unit == null && property.getInitializer() != null && measuredInitializer(property.getInitializer())) {
      report(property, name, property.getInitializer(), 0, false, true);
    }
    nested(property.getInitializer(), owner, name, unit, false);
    nested(property.getDelegateExpression(), owner, name, unit, false);
  }

  private static boolean measuredInitializer(KtExpression initializer) {
    Body metrics = new Body();
    metrics.visit(initializer, 0);
    return metrics.complexity > 1 || metrics.maxNesting > 0 || metrics.blocks > 0;
  }

  private static KtFunction unitOf(KtProperty property) {
    KtExpression initializer =
        property.getInitializer() == null ? null : KtPsiUtil.safeDeparenthesize(property.getInitializer());
    if (initializer instanceof KtLambdaExpression) {
      return ((KtLambdaExpression) initializer).getFunctionLiteral();
    }
    if (initializer instanceof KtNamedFunction && ((KtNamedFunction) initializer).getName() == null) {
      return (KtNamedFunction) initializer;
    }
    if (initializer != null && measuredInitializer(initializer)) {
      return null;
    }
    return lambdaArgument(initializer == null ? property.getDelegateExpression() : initializer);
  }

  private static KtFunction lambdaArgument(KtExpression holder) {
    KtExpression call = holder;
    if (call instanceof KtQualifiedExpression) {
      call = ((KtQualifiedExpression) call).getSelectorExpression();
    }
    if (!(call instanceof KtCallExpression)) {
      return null;
    }
    KtLambdaExpression lambda = null;
    for (KtValueArgument argument : ((KtCallExpression) call).getValueArguments()) {
      KtExpression expression = argument.getArgumentExpression();
      lambda = expression instanceof KtLambdaExpression ? (KtLambdaExpression) expression : lambda;
    }
    return lambda == null ? null : lambda.getFunctionLiteral();
  }

  private void klass(KtClassOrObject klass, String owner) {
    String simple = klass.getName();
    if (simple == null) {
      simple = klass instanceof KtObjectDeclaration && ((KtObjectDeclaration) klass).isCompanion()
          ? "Companion" : "<anonymous>";
    }
    String qualified = join(owner, simple);
    for (KtSuperTypeListEntry entry : klass.getSuperTypeListEntries()) {
      nested(entry, qualified, qualified, false);
    }
    for (KtDeclaration member : klass.getDeclarations()) {
      if (member instanceof KtClassInitializer) {
        initializer((KtClassInitializer) member, qualified);
      } else {
        declare(member, qualified);
      }
    }
    for (KtParameter parameter : klass.getPrimaryConstructorParameters()) {
      nested(parameter.getDefaultValue(), qualified, qualified, false);
    }
  }

  private void nested(PsiElement root, String owner, String scope, boolean inline) {
    nested(root, owner, scope, null, inline);
  }

  private void nested(PsiElement root, String owner, String scope, KtFunction held, boolean inline) {
    if (root == null) {
      return;
    }
    if (root instanceof KtClassOrObject) {
      klass((KtClassOrObject) root, owner);
    } else if (root instanceof KtLambdaExpression) {
      lambda((KtLambdaExpression) root, owner, scope, held, inline);
    } else if (root instanceof KtNamedFunction) {
      localFunction((KtNamedFunction) root, owner, scope, held, inline);
    } else if (root instanceof KtProperty && ((KtProperty) root).isLocal()) {
      localProperty((KtProperty) root, owner, scope, inline);
    } else {
      for (PsiElement child : root.getChildren()) {
        nested(child, owner, scope, held, inline);
      }
    }
  }

  private void lambda(KtLambdaExpression lambda, String owner, String scope, KtFunction held, boolean inline) {
    KtFunctionLiteral literal = lambda.getFunctionLiteral();
    String name = literal == held ? scope : join(scope, "<lambda>");
    if (literal != held && literal.getBodyExpression() != null) {
      report(lambda, name, literal.getBodyExpression(), literal.getValueParameters().size(), inline, false, true);
    }
    nested(literal.getBodyExpression(), owner, name, inline);
  }

  private void localFunction(KtNamedFunction function, String owner, String scope, KtFunction held, boolean inline) {
    if (function.getBodyExpression() == null) {
      return;
    }
    String name =
        function == held ? scope : join(scope, function.getName() == null ? "<lambda>" : function.getName());
    if (function != held) {
      report(function, name, function.getBodyExpression(), function.getValueParameters().size(), inline, false, true);
    }
    nested(function.getBodyExpression(), owner, name, inline);
  }

  private void localProperty(KtProperty property, String owner, String scope, boolean inline) {
    String name = join(scope, property.getName());
    KtFunction unit = unitOf(property);
    if (unit != null && unit.getBodyExpression() != null) {
      report(property, name, unit.getBodyExpression(), unit.getValueParameters().size(), inline, false, true);
    }
    nested(property.getInitializer(), owner, name, unit, inline);
    nested(property.getDelegateExpression(), owner, name, unit, inline);
  }

  private static String join(String owner, String name) {
    return owner.isEmpty() ? name : owner + "." + name;
  }

  private void report(KtDeclarationWithBody declaration, String name, KtExpression body) {
    report(declaration, name, body, declaration.getValueParameters().size(), inline(declaration));
  }

  private void report(PsiElement declaration, String name, KtExpression body, int parameters, boolean inline) {
    report(declaration, name, body, parameters, inline, false);
  }

  private void report(
      PsiElement declaration, String name, KtExpression body, int parameters, boolean inline, boolean initializer) {
    report(declaration, name, body, parameters, inline, initializer, false);
  }

  private void report(
      PsiElement declaration,
      String name,
      KtExpression body,
      int parameters,
      boolean inline,
      boolean initializer,
      boolean lambda) {
    int start = significant(declaration.getNode(), true);
    int end = significant(declaration.getNode(), false);
    int startLine = lineOf(start);
    int endLine = lineOf(Math.max(start, end - 1));
    Body metrics = new Body();
    boolean block = body instanceof KtBlockExpression;
    if (!block) {
      metrics.statements += 1;
    }
    metrics.visit(body, 0);
    entries.add(
        "{\"file\":" + Json.quote(relative)
            + ",\"name\":" + Json.quote(name)
            + ",\"start\":" + (startLine + 1)
            + ",\"end\":" + (endLine + 1)
            + ",\"lines\":" + (endLine - startLine + 1)
            + ",\"statements\":" + metrics.statements
            + ",\"maxControlNesting\":" + metrics.maxNesting
            + ",\"parameters\":" + parameters
            + ",\"complexity\":" + metrics.complexity
            + ",\"inline\":" + inline
            + ",\"initializer\":" + initializer
            + ",\"lambda\":" + lambda
            + "}");
  }

  private static boolean inline(KtDeclarationWithBody declaration) {
    PsiElement owner = declaration instanceof KtPropertyAccessor ? declaration.getParent() : declaration;
    return declaration.hasModifier(KtTokens.INLINE_KEYWORD)
        || (owner instanceof KtModifierListOwner
            && ((KtModifierListOwner) owner).hasModifier(KtTokens.INLINE_KEYWORD));
  }

  private int lineOf(int offset) {
    return lines.index(offset);
  }

  /** First or last offset of a declaration that is not whitespace, a comment or KDoc. */
  private static int significant(ASTNode node, boolean first) {
    ASTNode current = first ? node.getFirstChildNode() : node.getLastChildNode();
    while (current != null
        && (KtTokens.WHITESPACES.contains(current.getElementType())
            || KtTokens.COMMENTS.contains(current.getElementType()))) {
      current = first ? current.getTreeNext() : current.getTreePrev();
    }
    return first
        ? (current == null ? node.getStartOffset() : current.getStartOffset())
        : (current == null ? node.getTextRange().getEndOffset() : current.getTextRange().getEndOffset());
  }
}
