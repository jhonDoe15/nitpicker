package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.BlockTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.ParameterizedTypeTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreePath;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import com.sun.tools.javac.code.Types;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@BugPattern(
    summary = "A local list is only added to and searched, so every search scans the whole list.",
    severity = WARNING)
public final class ListUsedAsSet extends BugChecker implements BlockTreeMatcher {
  private static final Set<String> LISTS = Set.of("java.util.List", "java.util.ArrayList", "java.util.LinkedList");

  @Override
  public Description matchBlock(BlockTree block, VisitorState state) {
    List<? extends StatementTree> statements = block.getStatements();
    for (int index = 0; index < statements.size(); index++) {
      if (statements.get(index) instanceof VariableTree declaration) {
        SuggestedFix fix = rewrite(block, declaration, statements.subList(index + 1, statements.size()), state);
        if (fix != null) {
          state.reportMatch(describeMatch(block, fix));
        }
      }
    }
    return Description.NO_MATCH;
  }

  private SuggestedFix rewrite(
      BlockTree block, VariableTree declaration, List<? extends StatementTree> following, VisitorState state) {
    Symbol.VarSymbol local = ASTHelpers.getSymbol(declaration);
    ExpressionTree initializer = declaration.getInitializer();
    if (local == null
        || !(initializer instanceof NewClassTree created)
        || !plainConstruction(created, state)
        || !declaredAsList(declaration, local, state)
        || sharesType(declaration, block, state)
        || !distinguishable(local.type, state)
        || !ListUses.onlyAddedAndSearched(local, state.getPath(), following, state)) {
      return null;
    }
    List<Tree> names = names(declaration, created, state);
    if (names == null) {
      return null;
    }
    SuggestedFix.Builder fix = SuggestedFix.builder();
    List<int[]> replaced = new ArrayList<>();
    for (int index = 0; index < names.size(); index++) {
      Tree name = names.get(index);
      replaced.add(new int[] {Support.start(name), Support.end(name, state)});
      String replacement = index == 0 ? "java.util.LinkedHashSet" : "java.util.Set";
      fix.replace(name, SuggestedFixes.qualifyType(state, fix, replacement));
    }
    for (String name : new String[] {"ArrayList", "LinkedList", "List"}) {
      Support.dropImportIfUnused(fix, state, name, replaced.get(0), path -> rewrittenName(path, state));
    }
    return fix.build();
  }

  private static List<Tree> names(VariableTree declaration, NewClassTree created, VisitorState state) {
    Tree constructed = created.getIdentifier();
    Tree constructedName =
        constructed instanceof ParameterizedTypeTree parameterized ? parameterized.getType() : constructed;
    if (!(constructedName instanceof IdentifierTree)) {
      return null;
    }
    List<Tree> names = new ArrayList<>(List.of(constructedName));
    Tree type = declaration.getType();
    if (ASTHelpers.hasExplicitSource(type, state)) {
      Tree typeName = type instanceof ParameterizedTypeTree parameterized ? parameterized.getType() : type;
      if (!(typeName instanceof IdentifierTree)) {
        return null;
      }
      names.add(typeName);
    }
    return names;
  }

  private int[] rewrittenName(TreePath path, VisitorState state) {
    if (!(path.getLeaf() instanceof IdentifierTree name)) {
      return null;
    }
    TreePath owner = path.getParentPath();
    if (owner != null && owner.getLeaf() instanceof ParameterizedTypeTree) {
      owner = owner.getParentPath();
    }
    if (owner != null && owner.getLeaf() instanceof NewClassTree) {
      owner = owner.getParentPath();
    }
    if (owner == null
        || !(owner.getLeaf() instanceof VariableTree declaration)
        || !(declaration.getInitializer() instanceof NewClassTree created)
        || !(owner.getParentPath().getLeaf() instanceof BlockTree block)) {
      return null;
    }
    List<Tree> names = names(declaration, created, state);
    List<? extends StatementTree> statements = block.getStatements();
    int index = statements.indexOf(declaration);
    if (names == null
        || !names.contains(name)
        || rewrite(block, declaration, statements.subList(index + 1, statements.size()),
            state.withPath(owner.getParentPath()))
            == null) {
      return null;
    }
    return new int[] {Support.start(name), Support.end(name, state)};
  }

  private static boolean plainConstruction(NewClassTree created, VisitorState state) {
    Type type = ASTHelpers.getType(created);
    if (type == null || created.getClassBody() != null || created.getEnclosingExpression() != null) {
      return false;
    }
    String name = type.tsym.getQualifiedName().toString();
    List<? extends ExpressionTree> arguments = created.getArguments();
    if (name.equals("java.util.LinkedList")) {
      return arguments.isEmpty();
    }
    if (!name.equals("java.util.ArrayList")) {
      return false;
    }
    return arguments.isEmpty()
        || (arguments.size() == 1 && ASTHelpers.getType(arguments.get(0)).getKind() == javax.lang.model.type.TypeKind.INT);
  }

  private static boolean declaredAsList(VariableTree declaration, Symbol.VarSymbol local, VisitorState state) {
    Tree type = declaration.getType();
    if (!ASTHelpers.hasExplicitSource(type, state)) {
      return true;
    }
    Tree name = type instanceof ParameterizedTypeTree parameterized ? parameterized.getType() : type;
    return name instanceof IdentifierTree && LISTS.contains(local.type.tsym.getQualifiedName().toString());
  }

  private static boolean sharesType(VariableTree declaration, BlockTree block, VisitorState state) {
    if (!ASTHelpers.hasExplicitSource(declaration.getType(), state)) {
      return false;
    }
    int start = Support.start(declaration.getType());
    for (StatementTree other : block.getStatements()) {
      if (other != declaration
          && other instanceof VariableTree variable
          && ASTHelpers.hasExplicitSource(variable.getType(), state)
          && Support.start(variable.getType()) == start) {
        return true;
      }
    }
    return false;
  }

  private static boolean distinguishable(Type list, VisitorState state) {
    Types types = state.getTypes();
    Symbol listSymbol = state.getSymtab().listType.tsym;
    Type declared = types.asSuper(list, listSymbol);
    if (declared == null || declared.getTypeArguments().isEmpty()) {
      return false;
    }
    Type element = declared.getTypeArguments().get(0);
    if (!Support.stableValue(element, state)) {
      return false;
    }
    if (!(element.tsym instanceof Symbol.ClassSymbol) || element.tsym.isInterface() || element.tsym.isEnum()
        || element.tsym.getKind() == javax.lang.model.element.ElementKind.RECORD) {
      return true;
    }
    int equals = -1;
    int hash = -1;
    int depth = 0;
    for (Type current = element; current != null && current.tsym != null && !current.tsym.name.isEmpty(); current = types.supertype(current)) {
      if (current.tsym.getQualifiedName().contentEquals("java.lang.Object")) {
        break;
      }
      for (Symbol member : current.tsym.members().getSymbols()) {
        if (member instanceof Symbol.MethodSymbol method && !method.isStatic()) {
          String name = method.getSimpleName().toString();
          if (name.equals("equals") && method.params().size() == 1 && equals < 0) {
            equals = depth;
          } else if (name.equals("hashCode") && method.params().isEmpty() && hash < 0) {
            hash = depth;
          }
        }
      }
      depth++;
    }
    return equals < 0 || (hash >= 0 && hash <= equals);
  }
}
