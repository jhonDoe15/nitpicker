package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.NewClassTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.google.errorprone.util.TargetType;
import com.sun.source.tree.AssignmentTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreeScanner;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.util.TreePath;
import com.sun.tools.javac.code.Symbol.MethodSymbol;
import com.sun.tools.javac.code.Types;
import com.sun.source.tree.NewClassTree;
import com.sun.source.tree.ParameterizedTypeTree;
import com.sun.source.tree.Tree;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@BugPattern(
    summary = "Creates an EnumSet or EnumMap for an enum, not a HashSet or HashMap keyed by it.",
    severity = WARNING)
public final class UseEnumCollections extends BugChecker implements NewClassTreeMatcher {
  private static final Set<String> SET_TARGETS =
      Set.of("java.util.Set", "java.util.Collection", "java.lang.Iterable");
  private static final Set<String> MAP_TARGETS = Set.of("java.util.Map");

  @Override
  public Description matchNewClass(NewClassTree tree, VisitorState state) {
    if (!tree.getArguments().isEmpty()
        || tree.getClassBody() != null
        || tree.getEnclosingExpression() != null) {
      return Description.NO_MATCH;
    }
    Type created = ASTHelpers.getType(tree);
    if (created == null || created.tsym == null) {
      return Description.NO_MATCH;
    }
    String name = created.tsym.getQualifiedName().toString();
    boolean set = name.equals("java.util.HashSet");
    if (!set && !name.equals("java.util.HashMap")) {
      return Description.NO_MATCH;
    }
    List<Type> arguments = created.getTypeArguments();
    if (arguments.size() != (set ? 1 : 2) || !isEnum(arguments.get(0))) {
      return Description.NO_MATCH;
    }
    Type target = target(state);
    if (target == null
        || !(set ? SET_TARGETS : MAP_TARGETS).contains(state.getTypes().erasure(target).tsym.getQualifiedName().toString())
        || needsHashCollection(tree, set, state)
        || receivesNull(state)) {
      return Description.NO_MATCH;
    }
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String enumName = SuggestedFixes.prettyType(state, fix, arguments.get(0));
    String replacement = set ? setText(fix, enumName, state) : mapText(tree, fix, enumName, state);
    fix.replace(tree, replacement);
    Support.dropImportIfUnused(fix, state, set ? "HashSet" : "HashMap", replacedName(tree, set, state), path ->
        path.getLeaf() instanceof NewClassTree other
            && matchNewClass(other, state.withPath(path)) != Description.NO_MATCH
            ? replacedName(other, ASTHelpers.getType(other).tsym.getQualifiedName().contentEquals("java.util.HashSet"), state)
            : null);
    return describeMatch(tree, fix.build());
  }

  private static int[] replacedName(NewClassTree tree, boolean set, VisitorState state) {
    ExpressionTree identifier = tree.getIdentifier();
    if (!set && identifier instanceof ParameterizedTypeTree parameterized) {
      identifier = (ExpressionTree) parameterized.getType();
    }
    Tree range = set ? tree : identifier;
    return new int[] {Support.start(range), Support.end(range, state)};
  }

  private static String setText(SuggestedFix.Builder fix, String enumName, VisitorState state) {
    String type = SuggestedFixes.qualifyType(state, fix, "java.util.EnumSet");
    return type + ".noneOf(" + enumName + ".class)";
  }

  private static String mapText(NewClassTree tree, SuggestedFix.Builder fix, String enumName, VisitorState state) {
    String type = SuggestedFixes.qualifyType(state, fix, "java.util.EnumMap");
    return "new " + type + typeArguments(tree, state) + "(" + enumName + ".class)";
  }

  private static String typeArguments(NewClassTree tree, VisitorState state) {
    ExpressionTree identifier = tree.getIdentifier();
    if (!(identifier instanceof ParameterizedTypeTree parameterized) || parameterized.getTypeArguments().isEmpty()) {
      return "<>";
    }
    return parameterized.getTypeArguments().stream()
        .map(argument -> Support.source(argument, state))
        .collect(Collectors.joining(", ", "<", ">"));
  }

  private static boolean isEnum(Type type) {
    Symbol symbol = type.tsym;
    return type.getKind() == javax.lang.model.type.TypeKind.DECLARED
        && symbol != null
        && (symbol.flags() & com.sun.tools.javac.code.Flags.ENUM) != 0;
  }

  private static boolean receivesNull(VisitorState state) {
    TreePath path = state.getPath();
    while (path.getParentPath().getLeaf() instanceof ParenthesizedTree) {
      path = path.getParentPath();
    }
    Tree parent = path.getParentPath().getLeaf();
    Symbol variable = null;
    if (parent instanceof VariableTree declaration && declaration.getInitializer() == path.getLeaf()) {
      variable = ASTHelpers.getSymbol(declaration);
    } else if (parent instanceof AssignmentTree assignment && assignment.getExpression() == path.getLeaf()) {
      variable = ASTHelpers.getSymbol(assignment.getVariable());
    }
    if (variable == null) {
      return false;
    }
    Symbol target = variable;
    boolean[] found = {false};
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitMethodInvocation(MethodInvocationTree call, Void unused) {
        if (call.getMethodSelect() instanceof MemberSelectTree select
            && ASTHelpers.getSymbol(Support.unparenthesized(select.getExpression())) == target) {
          for (ExpressionTree argument : call.getArguments()) {
            found[0] |= Support.unparenthesized(argument) instanceof LiteralTree literal && literal.getValue() == null;
          }
        }
        return super.visitMethodInvocation(call, unused);
      }
    }.scan(state.getPath().getCompilationUnit(), null);
    return found[0];
  }

  private static Type target(VisitorState state) {
    TargetType target = ASTHelpers.targetType(state);
    return target == null ? null : target.type();
  }

  private static boolean needsHashCollection(NewClassTree tree, boolean set, VisitorState state) {
    TreePath path = state.getPath();
    Tree parent = path.getParentPath().getLeaf();
    while (parent instanceof ParenthesizedTree) {
      path = path.getParentPath();
      parent = path.getParentPath().getLeaf();
    }
    List<? extends ExpressionTree> arguments;
    if (parent instanceof MethodInvocationTree call) {
      arguments = call.getArguments();
    } else if (parent instanceof NewClassTree call) {
      arguments = call.getArguments();
    } else {
      return parent instanceof MemberSelectTree;
    }
    Symbol method = ASTHelpers.getSymbol(parent);
    if (!(method instanceof MethodSymbol chosen)) {
      return true;
    }
    int index = arguments.indexOf(path.getLeaf());
    if (index < 0 || chosen.isVarArgs()) {
      return true;
    }
    Types types = state.getTypes();
    Type enumKind = types.erasure(state.getTypeFromString(set ? "java.util.EnumSet" : "java.util.EnumMap"));
    Type hashKind = types.erasure(state.getTypeFromString(set ? "java.util.HashSet" : "java.util.HashMap"));
    for (Symbol member : types.membersClosure(chosen.owner.type, false).getSymbolsByName(chosen.name)) {
      if (member instanceof MethodSymbol other
          && other.getParameters().size() == chosen.getParameters().size()
          && (other.isVarArgs() || acceptsOnlyEnumKind(other, index, enumKind, hashKind, types))) {
        return true;
      }
    }
    return false;
  }

  private static boolean acceptsOnlyEnumKind(
      MethodSymbol method, int index, Type enumKind, Type hashKind, Types types) {
    Type parameter = types.erasure(method.type.getParameterTypes().get(index));
    return types.isSubtype(enumKind, parameter) && !types.isSubtype(hashKind, parameter);
  }
}
