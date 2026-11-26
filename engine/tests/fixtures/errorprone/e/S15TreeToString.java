package e;

import com.google.common.base.Joiner;
import com.google.common.flogger.FluentLogger;
import com.google.errorprone.VisitorState;
import com.google.errorprone.annotations.FormatMethod;
import com.google.errorprone.bugpatterns.BugChecker;
import com.sun.source.tree.ClassTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.Tree;
import java.util.List;
import java.util.function.Function;

class S15TreeToString {
  private static final FluentLogger logger = FluentLogger.forEnclosingClass();

  static class NotAChecker {
    String render(Tree tree) {
      return tree.toString() + tree;
    }
  }

  static class Checker extends BugChecker {
    private VisitorState fieldState;

    @FormatMethod
    static void format(String format, Object... args) {}

    String implicit(Tree tree, VisitorState state, ExpressionTree expression, String text) {
      String a = "x" + tree;
      String b = tree + "x";
      String c = "";
      c += expression;
      String d = text + 1 + tree;
      String e = tree.toString();
      String f = String.valueOf(tree);
      String g = expression.toString();
      String h = text + 1;
      System.out.println(tree);
      System.out.println(text);
      new StringBuilder().append(tree);
      new StringBuilder().append(text);
      String i = String.format("%s", tree);
      String j = "%s".formatted(tree);
      String k = String.format("%s %s", text, expression);
      format("%s", tree);
      logger.atInfo().log("%s", tree);
      Object o = tree;
      String l = o.toString();
      String m = "x" + null;
      String n = tree.hashCode() + "";
      return a + b + c + d + e + f + g + h + i + j + k + l + m + n;
    }

    String noState(Tree tree) {
      return "x" + tree + tree.toString() + String.valueOf(tree);
    }

    String joins(Joiner joiner, List<Tree> trees, Tree[] array, Tree one, String text) {
      String a = joiner.join(trees);
      String b = joiner.join(array);
      String c = joiner.join(one, text, one);
      String d = joiner.join(text, text, text);
      String e = joiner.join(one, one);
      return a + b + c + d + e;
    }

    Function<Tree, String> references() {
      Function<Tree, String> a = Tree::toString;
      Function<Tree, String> b = String::valueOf;
      Function<String, String> c = String::valueOf;
      Function<Object, String> d = Object::toString;
      Function<ClassTree, String> e = ClassTree::toString;
      return a.andThen(x -> x);
    }

    String inLambda(List<Tree> trees) {
      VisitorState state = null;
      Runnable r = () -> System.out.println("x" + trees.get(0));
      Function<Tree, String> f = t -> t.toString();
      return trees.get(0).toString() + state;
    }

    String valueOfWithField(MethodTree tree) {
      return String.valueOf(tree);
    }

    String valueOfWithFieldTwice(MethodTree tree) {
      String a = String.valueOf(tree);
      return a + String.valueOf(tree);
    }

    String fromField(MethodTree tree) {
      return "x" + tree;
    }

    String fromLocal(MethodTree tree) {
      VisitorState first = null;
      VisitorState second = null;
      return "x" + tree;
    }

    String later(MethodTree tree) {
      String before = "x" + tree;
      VisitorState state = null;
      return before;
    }

    @SuppressWarnings("TreeToString")
    String suppressed(Tree tree) {
      return "x" + tree;
    }

    class Inner {
      String render(Tree tree) {
        return "x" + tree;
      }
    }
  }
}
