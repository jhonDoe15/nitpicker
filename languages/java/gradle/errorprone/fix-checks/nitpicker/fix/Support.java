package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.AnnotationTree;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.ImportTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.ClassTree;
import com.sun.source.util.TreePath;
import com.sun.source.util.TreePathScanner;
import com.sun.tools.javac.code.Symbol;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/** Shared helpers of the fix-only checks: removals, imports and source text. */
final class Support {
  private Support() {}

  static boolean isAnnotation(AnnotationTree annotation, String qualifiedName) {
    Symbol symbol = ASTHelpers.getSymbol(annotation);
    return symbol != null && symbol.getQualifiedName().contentEquals(qualifiedName);
  }

  static boolean isAnnotation(AnnotationTree annotation, String... qualifiedNames) {
    for (String name : qualifiedNames) {
      if (isAnnotation(annotation, name)) {
        return true;
      }
    }
    return false;
  }

  static String simpleName(AnnotationTree annotation) {
    Tree type = annotation.getAnnotationType();
    if (type instanceof MemberSelectTree select) {
      return select.getIdentifier().toString();
    }
    return type instanceof IdentifierTree identifier ? identifier.getName().toString() : type.toString();
  }

  static List<TreePath> annotationPaths(VisitorState state) {
    List<TreePath> found = new ArrayList<>();
    new TreePathScanner<Void, Void>() {
      @Override
      public Void visitAnnotation(AnnotationTree node, Void unused) {
        found.add(getCurrentPath());
        return super.visitAnnotation(node, unused);
      }
    }.scan(new TreePath(state.getPath().getCompilationUnit()), null);
    return found;
  }

  static List<ClassTree> classes(VisitorState state) {
    List<ClassTree> found = new ArrayList<>();
    new TreePathScanner<Void, Void>() {
      @Override
      public Void visitClass(ClassTree node, Void unused) {
        found.add(node);
        return super.visitClass(node, unused);
      }
    }.scan(new TreePath(state.getPath().getCompilationUnit()), null);
    return found;
  }

  static ExpressionTree unparenthesized(ExpressionTree tree) {
    ExpressionTree current = tree;
    while (current instanceof ParenthesizedTree parenthesized) {
      current = parenthesized.getExpression();
    }
    return current;
  }

  static int start(Tree tree) {
    return ASTHelpers.getStartPosition(tree);
  }

  static int end(Tree tree, VisitorState state) {
    return state.getEndPosition(tree);
  }

  static String source(Tree tree, VisitorState state) {
    return state.getSourceCode().subSequence(start(tree), end(tree, state)).toString();
  }

  static int[] removalRange(Tree tree, VisitorState state) {
    CharSequence text = state.getSourceCode();
    int end = end(tree, state);
    while (end < text.length() && Character.isWhitespace(text.charAt(end))) {
      end++;
    }
    return new int[] {start(tree), end};
  }

  static String indentAt(int position, VisitorState state) {
    CharSequence text = state.getSourceCode();
    int lineStart = position;
    while (lineStart > 0 && text.charAt(lineStart - 1) != '\n') {
      lineStart--;
    }
    int index = lineStart;
    while (index < position && (text.charAt(index) == ' ' || text.charAt(index) == '\t')) {
      index++;
    }
    return text.subSequence(lineStart, index).toString();
  }

  static boolean startsLine(int position, VisitorState state) {
    CharSequence text = state.getSourceCode();
    int index = position;
    while (index > 0 && (text.charAt(index - 1) == ' ' || text.charAt(index - 1) == '\t')) {
      index--;
    }
    return index == 0 || text.charAt(index - 1) == '\n';
  }

  static void dropImportIfUnused(
      SuggestedFix.Builder fix, VisitorState state, String simpleName, List<int[]> removed) {
    CompilationUnitTree unit = state.getPath().getCompilationUnit();
    ImportTree found = null;
    for (ImportTree candidate : unit.getImports()) {
      String name = candidate.getQualifiedIdentifier().toString();
      if (!candidate.isStatic() && name.endsWith("." + simpleName)) {
        found = candidate;
      }
    }
    if (found == null) {
      return;
    }
    String text = state.getSourceCode().toString();
    int importStart = start(found);
    int importEnd = end(found, state);
    Pattern name = Pattern.compile("(?<![\\w$])" + Pattern.quote(simpleName) + "(?![\\w$])");
    var matcher = name.matcher(text);
    while (matcher.find()) {
      int at = matcher.start();
      boolean covered = at >= importStart && at < importEnd;
      for (int[] range : removed) {
        covered |= at >= range[0] && at < range[1];
      }
      if (!covered) {
        return;
      }
    }
    fix.removeImport(found.getQualifiedIdentifier().toString());
  }
}
