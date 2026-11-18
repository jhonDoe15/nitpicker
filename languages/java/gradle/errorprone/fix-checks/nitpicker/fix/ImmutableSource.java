package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Symbol;
import java.util.Set;
import javax.lang.model.element.Modifier;

/** Collections built by a factory that rejects null elements and bound once: they never change. */
final class ImmutableSource {
  private static final Set<String> FACTORIES = Set.of("java.util.List", "java.util.Set");

  private ImmutableSource() {}

  static boolean proven(Symbol collection, int loopStart, VisitorState state) {
    if (!(collection instanceof Symbol.VarSymbol variable)) {
      return false;
    }
    boolean field = variable.getKind().isField();
    boolean bound = field
        ? variable.getModifiers().contains(Modifier.FINAL)
        : ASTHelpers.isConsideredFinal(variable);
    VariableTree declaration = declaration(variable, state);
    if (!bound || declaration == null || declaration.getInitializer() == null) {
      return false;
    }
    if (!field && Support.start(declaration) >= loopStart) {
      return false;
    }
    return factory(Support.unparenthesized(declaration.getInitializer()));
  }

  private static boolean factory(ExpressionTree initializer) {
    if (!(initializer instanceof MethodInvocationTree call)) {
      return false;
    }
    Symbol method = ASTHelpers.getSymbol(call);
    if (method == null || !method.isStatic() || !FACTORIES.contains(method.owner.getQualifiedName().toString())) {
      return false;
    }
    String name = method.getSimpleName().toString();
    return name.equals("of") || name.equals("copyOf");
  }

  private static VariableTree declaration(Symbol.VarSymbol variable, VisitorState state) {
    VariableTree[] found = {null};
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitVariable(VariableTree node, Void unused) {
        if (ASTHelpers.getSymbol(node) == variable) {
          found[0] = node;
        }
        return super.visitVariable(node, unused);
      }
    }.scan(state.getPath().getCompilationUnit(), null);
    return found[0];
  }
}
