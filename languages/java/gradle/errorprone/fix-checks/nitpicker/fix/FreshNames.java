package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.sun.source.tree.CompilationUnitTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.MethodTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreeScanner;
import java.util.Collections;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.WeakHashMap;

/** Names no declaration or use of the compilation unit has, shared by every fix made in it. */
final class FreshNames {
  private static final Map<CompilationUnitTree, Set<String>> TAKEN =
      Collections.synchronizedMap(new WeakHashMap<>());

  private FreshNames() {}

  static String claim(String base, VisitorState state) {
    return claim(base, "", state);
  }

  static String claim(String base, String separator, VisitorState state) {
    Set<String> taken = taken(state);
    synchronized (taken) {
      String name = base;
      for (int index = 2; taken.contains(name); index++) {
        name = base + separator + index;
      }
      taken.add(name);
      return name;
    }
  }

  private static Set<String> taken(VisitorState state) {
    CompilationUnitTree unit = state.getPath().getCompilationUnit();
    return TAKEN.computeIfAbsent(unit, FreshNames::scan);
  }

  private static Set<String> scan(CompilationUnitTree unit) {
    Set<String> names = new HashSet<>();
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitVariable(VariableTree node, Void unused) {
        names.add(node.getName().toString());
        return super.visitVariable(node, unused);
      }

      @Override
      public Void visitMethod(MethodTree node, Void unused) {
        names.add(node.getName().toString());
        return super.visitMethod(node, unused);
      }

      @Override
      public Void visitIdentifier(IdentifierTree node, Void unused) {
        names.add(node.getName().toString());
        return null;
      }
    }.scan(unit, null);
    return names;
  }
}
