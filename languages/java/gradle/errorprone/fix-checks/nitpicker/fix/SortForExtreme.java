package nitpicker.fix;

import static com.google.errorprone.BugPattern.SeverityLevel.WARNING;

import com.google.errorprone.BugPattern;
import com.google.errorprone.VisitorState;
import com.google.errorprone.bugpatterns.BugChecker;
import com.google.errorprone.bugpatterns.BugChecker.MethodInvocationTreeMatcher;
import com.google.errorprone.fixes.SuggestedFix;
import com.google.errorprone.fixes.SuggestedFixes;
import com.google.errorprone.matchers.Description;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.LiteralTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.tools.javac.code.Source;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import com.sun.tools.javac.code.Types;
import java.util.regex.Pattern;
import javax.lang.model.type.TypeKind;

@BugPattern(
    summary = "Sorts a stream only to take its first element; min(comparator) finds it in one pass.",
    severity = WARNING)
public final class SortForExtreme extends BugChecker implements MethodInvocationTreeMatcher {
  private static final Pattern COLLECTORS = Pattern.compile("(?<![\\w$])Collectors(?![\\w$])");
  private static final Pattern DOT = Pattern.compile("\\s*\\.\\s*");

  @Override
  public Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    if (!(tree.getMethodSelect() instanceof MemberSelectTree select)) {
      return Description.NO_MATCH;
    }
    String name = select.getIdentifier().toString();
    boolean optional = name.equals("findFirst") && tree.getArguments().isEmpty();
    boolean first = isFirstOfList(name, tree);
    if (!optional && !first) {
      return Description.NO_MATCH;
    }
    ExpressionTree upstream = select.getExpression();
    if (first) {
      upstream = listedStream(upstream, state);
    }
    if (!(upstream instanceof MethodInvocationTree sorted) || !isStreamSorted(sorted, state)) {
      return Description.NO_MATCH;
    }
    MemberSelectTree sortedSelect = (MemberSelectTree) sorted.getMethodSelect();
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String comparator = comparatorText(sorted, sortedSelect, fix, state);
    String joint = joint(sortedSelect, state);
    if (comparator == null || joint == null) {
      return Description.NO_MATCH;
    }
    String unwrap = Source.instance(state.context).compareTo(Source.JDK10) >= 0 ? ".orElseThrow()" : ".get()";
    String replacement = joint + "min(" + comparator + ")" + (first ? unwrap : "");
    int from = Support.end(sortedSelect.getExpression(), state);
    fix.replace(from, Support.end(tree, state), replacement);
    if (!reusesCollectors(sorted, state)) {
      Support.dropImportIfUnused(fix, state, "Collectors", new int[] {from, Support.end(tree, state)}, path ->
          path.getLeaf() instanceof MethodInvocationTree other
              && matchMethodInvocation(other, state.withPath(path)) != Description.NO_MATCH
              && !reusesCollectors(sortedCall(other, state), state)
              ? new int[] {sortedFrom(other, state), Support.end(other, state)}
              : null);
    }
    return describeMatch(tree, fix.build());
  }

  private static boolean reusesCollectors(MethodInvocationTree sorted, VisitorState state) {
    return !sorted.getArguments().isEmpty()
        && COLLECTORS.matcher(Support.source(sorted.getArguments().get(0), state)).find();
  }

  private static int sortedFrom(MethodInvocationTree tree, VisitorState state) {
    MemberSelectTree sortedSelect = (MemberSelectTree) sortedCall(tree, state).getMethodSelect();
    return Support.end(sortedSelect.getExpression(), state);
  }

  private static MethodInvocationTree sortedCall(MethodInvocationTree tree, VisitorState state) {
    MemberSelectTree select = (MemberSelectTree) tree.getMethodSelect();
    String name = select.getIdentifier().toString();
    ExpressionTree upstream = select.getExpression();
    return (MethodInvocationTree) (isFirstOfList(name, tree) ? listedStream(upstream, state) : upstream);
  }

  private static boolean isFirstOfList(String name, MethodInvocationTree tree) {
    if (name.equals("getFirst")) {
      return tree.getArguments().isEmpty();
    }
    return name.equals("get")
        && tree.getArguments().size() == 1
        && Support.unparenthesized(tree.getArguments().get(0)) instanceof LiteralTree literal
        && literal.getValue() instanceof Integer index
        && index == 0;
  }

  private static ExpressionTree listedStream(ExpressionTree list, VisitorState state) {
    if (!(list instanceof MethodInvocationTree call)
        || !(call.getMethodSelect() instanceof MemberSelectTree select)) {
      return null;
    }
    Symbol method = ASTHelpers.getSymbol(call);
    boolean streamOwner = method != null && method.owner.getQualifiedName().contentEquals("java.util.stream.Stream");
    if (!streamOwner) {
      return null;
    }
    String name = select.getIdentifier().toString();
    boolean plain = name.equals("toList") && call.getArguments().isEmpty();
    boolean collected = name.equals("collect")
        && call.getArguments().size() == 1
        && isListCollector(call.getArguments().get(0));
    return plain || collected ? select.getExpression() : null;
  }

  private static boolean isListCollector(ExpressionTree argument) {
    if (!(Support.unparenthesized(argument) instanceof MethodInvocationTree collector)
        || !collector.getArguments().isEmpty()) {
      return false;
    }
    Symbol method = ASTHelpers.getSymbol(collector);
    return method != null
        && method.owner.getQualifiedName().contentEquals("java.util.stream.Collectors")
        && (method.name.contentEquals("toList") || method.name.contentEquals("toUnmodifiableList"));
  }

  private static boolean isStreamSorted(MethodInvocationTree call, VisitorState state) {
    Symbol method = ASTHelpers.getSymbol(call);
    return method != null
        && call.getMethodSelect() instanceof MemberSelectTree
        && method.name.contentEquals("sorted")
        && method.owner.getQualifiedName().contentEquals("java.util.stream.Stream")
        && call.getArguments().size() <= 1;
  }

  private static String joint(MemberSelectTree sortedSelect, VisitorState state) {
    int from = Support.end(sortedSelect.getExpression(), state);
    int to = Support.end(sortedSelect, state) - sortedSelect.getIdentifier().length();
    if (to < from) {
      return null;
    }
    String between = state.getSourceCode().subSequence(from, to).toString();
    return DOT.matcher(between).matches() ? between : null;
  }

  private static String comparatorText(
      MethodInvocationTree sorted, MemberSelectTree select, SuggestedFix.Builder fix, VisitorState state) {
    if (!sorted.getArguments().isEmpty()) {
      return Support.source(sorted.getArguments().get(0), state);
    }
    Type stream = ASTHelpers.getType(select.getExpression());
    Types types = state.getTypes();
    Symbol streamSymbol = state.getSymbolFromString("java.util.stream.Stream");
    Type asStream = stream == null || streamSymbol == null ? null : types.asSuper(stream, streamSymbol);
    if (asStream == null || asStream.getTypeArguments().size() != 1) {
      return null;
    }
    Type element = asStream.getTypeArguments().get(0);
    if (!isNaturallyOrdered(element, state)) {
      return null;
    }
    return SuggestedFixes.qualifyType(state, fix, "java.util.Comparator") + ".naturalOrder()";
  }

  private static boolean isNaturallyOrdered(Type element, VisitorState state) {
    Types types = state.getTypes();
    Symbol comparable = state.getSymbolFromString("java.lang.Comparable");
    boolean plain = element.getKind() == TypeKind.DECLARED
        || (element.getKind() == TypeKind.TYPEVAR && !(element instanceof Type.CapturedType));
    Type viaSuper = comparable == null || !plain ? null : types.asSuper(element, comparable);
    if (viaSuper == null || viaSuper.getTypeArguments().size() != 1) {
      return false;
    }
    Type compared = viaSuper.getTypeArguments().get(0);
    boolean concrete = compared.getKind() == TypeKind.DECLARED || compared.getKind() == TypeKind.TYPEVAR;
    return concrete && !(compared instanceof Type.CapturedType) && types.isSubtype(element, compared);
  }
}
