package nitpicker.fix;

import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Symbol;
import javax.lang.model.element.ElementKind;

/** The key side and the probe side of a lookup predicate. */
final class LookupKeys {
  private LookupKeys() {}

  static boolean isKey(ExpressionTree side, Symbol parameter) {
    if (side instanceof MethodInvocationTree call) {
      return call.getArguments().isEmpty()
          && call.getMethodSelect() instanceof MemberSelectTree select
          && select.getExpression() instanceof IdentifierTree
          && ASTHelpers.getSymbol(select.getExpression()) == parameter
          && isAccessor(ASTHelpers.getSymbol(call));
    }
    if (side instanceof MemberSelectTree select
        && select.getExpression() instanceof IdentifierTree
        && ASTHelpers.getSymbol(select.getExpression()) == parameter) {
      Symbol field = ASTHelpers.getSymbol(select);
      return field instanceof Symbol.VarSymbol && !field.isStatic() && field.getKind().isField();
    }
    return false;
  }

  static boolean isAccessor(Symbol method) {
    if (!(method instanceof Symbol.MethodSymbol symbol) || symbol.isStatic() || !symbol.getParameters().isEmpty()) {
      return false;
    }
    String name = method.getSimpleName().toString();
    if (name.length() > 3 && name.startsWith("get") && Character.isUpperCase(name.charAt(3))
        || name.length() > 2 && name.startsWith("is") && Character.isUpperCase(name.charAt(2))) {
      return true;
    }
    return method.owner.getKind() == ElementKind.RECORD
        && method.owner.getEnclosedElements().stream()
            .anyMatch(
                member ->
                    member.getKind() == ElementKind.RECORD_COMPONENT
                        && member.getSimpleName().contentEquals(name));
  }

  static boolean isPure(ExpressionTree probe, Symbol collection, Symbol parameter) {
    boolean[] ok = {true};
    boolean[] named = {false};
    new TreeScanner<Void, Void>() {
      @Override
      public Void scan(Tree node, Void unused) {
        if (node == null) {
          return null;
        }
        if (node instanceof IdentifierTree identifier) {
          boolean self = identifier.getName().contentEquals("this");
          Symbol symbol = ASTHelpers.getSymbol(identifier);
          boolean variable =
              symbol instanceof Symbol.VarSymbol
                  && symbol != collection
                  && symbol != parameter
                  && !symbol.isStatic();
          named[0] |= variable;
          ok[0] &= variable || self;
          return null;
        }
        if (node instanceof MemberSelectTree select) {
          Symbol symbol = ASTHelpers.getSymbol(select);
          ok[0] &= symbol instanceof Symbol.VarSymbol && !symbol.isStatic() && symbol != collection;
          return scan(select.getExpression(), null);
        }
        if (node instanceof MethodInvocationTree call) {
          if (call.getArguments().isEmpty()
              && call.getMethodSelect() instanceof MemberSelectTree select
              && isAccessor(ASTHelpers.getSymbol(call))) {
            return scan(select.getExpression(), null);
          }
          ok[0] = false;
          return null;
        }
        if (node instanceof ParenthesizedTree) {
          return super.scan(node, null);
        }
        ok[0] = false;
        return null;
      }
    }.scan(probe, null);
    return ok[0] && named[0];
  }

  static String keyName(ExpressionTree key) {
    Symbol symbol = ASTHelpers.getSymbol(key);
    String name = symbol.getSimpleName().toString();
    if (name.length() > 3 && name.startsWith("get") && Character.isUpperCase(name.charAt(3))) {
      name = name.substring(3);
    } else if (name.length() > 2 && name.startsWith("is") && Character.isUpperCase(name.charAt(2))) {
      name = name.substring(2);
    }
    return Character.toUpperCase(name.charAt(0)) + name.substring(1);
  }
}
