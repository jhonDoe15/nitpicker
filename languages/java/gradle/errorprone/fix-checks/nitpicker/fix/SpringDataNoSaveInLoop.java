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
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.MemberReferenceTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Source;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import java.util.List;
import java.util.Set;
import javax.lang.model.type.TypeKind;

@BugPattern(
    summary = "Collects the entities a loop saves or deletes one by one and writes them with one batch call.",
    severity = WARNING)
public class SpringDataNoSaveInLoop extends BugChecker implements MethodInvocationTreeMatcher {
  boolean oneElement() {
    return false;
  }

  @Override
  public final Description matchMethodInvocation(MethodInvocationTree tree, VisitorState state) {
    Description reference = oneElement() ? null : methodReference(tree, state);
    if (reference != null) {
      return reference;
    }
    LoopWrite write = LoopWrite.of(tree, state, oneElement());
    if (write == null) {
      return Description.NO_MATCH;
    }
    boolean lambdaLoop = !(write.loop instanceof EnhancedForLoopTree) && write.loop.getKind() != Tree.Kind.FOR_LOOP;
    List<Tree> scanned = new java.util.ArrayList<>(List.of(write.body));
    if (write.loop instanceof com.sun.source.tree.ForLoopTree loop) {
      scanned.add(loop.getCondition());
      scanned.addAll(loop.getUpdate());
    }
    if (lambdaLoop) {
      scanned.addAll(LoopEffects.perElement(iterated(write.statement)));
    }
    if (LoopEffects.blocked(scanned, tree, lambdaLoop, state)) {
      return Description.NO_MATCH;
    }
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String whole = wholeCollection(write, fix, state);
    boolean stream = lambdaLoop && !isIterable(iterated(write.statement), state);
    String text = whole != null || stream ? whole : collected(write, fix, state);
    if (text != null && oneElement()) {
      dropFactoryImport(write.call.getArguments().get(0), write.element, fix, state);
    }
    return text == null ? Description.NO_MATCH : describeMatch(write.statement, fix.replace(write.statement, text).build());
  }

  private Description methodReference(MethodInvocationTree tree, VisitorState state) {
    if (!(tree.getMethodSelect() instanceof MemberSelectTree select)
        || !Set.of("forEach", "forEachOrdered").contains(select.getIdentifier().toString())
        || tree.getArguments().size() != 1
        || !(tree.getArguments().get(0) instanceof MemberReferenceTree reference)
        || !LoopWrite.BATCHES.containsKey(reference.getName().toString())
        || !(state.getPath().getParentPath().getLeaf() instanceof ExpressionStatementTree statement)
        || !(state.getPath().getParentPath().getParentPath().getLeaf() instanceof BlockTree)
        || !LoopWrite.isRepository(reference.getQualifierExpression(), state)
        || !LoopWrite.stable(reference.getQualifierExpression())
        || !LoopEffects.iterates(select.getExpression(), state)
        || LoopEffects.blocked(LoopEffects.perElement(select.getExpression()), tree, true, state)) {
      return null;
    }
    String batch = LoopWrite.BATCHES.get(reference.getName().toString());
    String repository = Support.source(reference.getQualifierExpression(), state);
    if (isIterable(select.getExpression(), state)) {
      return describeMatch(statement, SuggestedFix.replace(statement,
          repository + "." + batch + "(" + Support.source(select.getExpression(), state) + ");"));
    }
    if (!isStream(select.getExpression(), state)) {
      return null;
    }
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String collected = Support.source(select.getExpression(), state) + collect(fix, state);
    return describeMatch(statement, fix.replace(statement, repository + "." + batch + "(" + collected + ");").build());
  }

  private static void dropFactoryImport(
      ExpressionTree argument, ExpressionTree element, SuggestedFix.Builder fix, VisitorState state) {
    if (Support.unparenthesized(argument) instanceof MethodInvocationTree factory
        && factory.getMethodSelect() instanceof MemberSelectTree select
        && select.getExpression() instanceof IdentifierTree owner) {
      int start = Support.start(factory);
      int end = Support.end(factory, state);
      boolean inside = Support.start(element) >= start && Support.end(element, state) <= end;
      List<int[]> ranges = inside
          ? List.of(new int[] {start, Support.start(element)}, new int[] {Support.end(element, state), end})
          : List.of(new int[] {start, end});
      Support.dropImportIfUnused(fix, state, owner.getName().toString(), ranges);
    }
  }

  private static String wholeCollection(LoopWrite write, SuggestedFix.Builder fix, VisitorState state) {
    ExpressionTree iterated;
    Symbol variable;
    if (write.loop instanceof EnhancedForLoopTree loop && single(loop.getStatement(), write.call)) {
      iterated = loop.getExpression();
      variable = ASTHelpers.getSymbol(loop.getVariable());
    } else if (write.body == write.call || single(write.body, write.call)) {
      ExpressionTree receiver = iterated(write.statement);
      LambdaExpressionTree lambda = lambdaOf(write.statement);
      if (receiver == null || lambda == null || lambda.getParameters().size() != 1) {
        return null;
      }
      if (!isIterable(receiver, state)) {
        return isStream(receiver, state) ? streamed(write, receiver, lambda, fix, state) : null;
      }
      iterated = receiver;
      variable = ASTHelpers.getSymbol(lambda.getParameters().get(0));
    } else {
      return null;
    }
    if (!(write.element instanceof IdentifierTree name) || variable == null || ASTHelpers.getSymbol(name) != variable) {
      return null;
    }
    Type type = ASTHelpers.getType(iterated);
    String source = Support.source(iterated, state);
    if (type != null && type.getKind() == TypeKind.ARRAY) {
      Type component = ((Type.ArrayType) type).getComponentType();
      if (component.isPrimitive()) {
        return null;
      }
      source = SuggestedFixes.qualifyType(state, fix, "java.util.Arrays") + ".asList(" + source + ")";
    }
    return Support.source(write.receiver, state) + "." + write.batch + "(" + source + ");";
  }

  private static String streamed(LoopWrite write, ExpressionTree receiver, LambdaExpressionTree lambda,
      SuggestedFix.Builder fix, VisitorState state) {
    Symbol variable = ASTHelpers.getSymbol(lambda.getParameters().get(0));
    boolean same = write.element instanceof IdentifierTree name && ASTHelpers.getSymbol(name) == variable;
    String mapped = same ? "" : ".map((" + Support.source(lambda.getParameters().get(0), state) + ") -> "
        + Support.source(write.element, state) + ")";
    return Support.source(write.receiver, state) + "." + write.batch + "(" + Support.source(receiver, state) + mapped
        + collect(fix, state) + ");";
  }

  private static String collect(SuggestedFix.Builder fix, VisitorState state) {
    if (Source.instance(state.context).compareTo(Source.JDK16) >= 0) {
      return ".toList()";
    }
    return ".collect(" + SuggestedFixes.qualifyType(state, fix, "java.util.stream.Collectors") + ".toList())";
  }

  private static boolean isStream(ExpressionTree tree, VisitorState state) {
    Type type = ASTHelpers.getType(tree);
    Type stream = state.getTypeFromString("java.util.stream.Stream");
    return type != null && stream != null && ASTHelpers.isSubtype(type, stream, state);
  }

  private static String collected(LoopWrite write, SuggestedFix.Builder fix, VisitorState state) {
    if (declaredOutside(write)) {
      return null;
    }
    Type element = ASTHelpers.getType(write.element);
    String type = element == null ? null : typeName(state.getTypes().boxedTypeOrType(element), fix, state);
    if (type == null) {
      return null;
    }
    String name = freshName(write.batch.startsWith("delete") ? "delete" : "save", state);
    String indent = Support.indentAt(Support.start(write.statement), state);
    String loop = Support.source(write.statement, state);
    int from = Support.start(write.call) - Support.start(write.statement);
    int to = Support.end(write.call, state) - Support.start(write.statement);
    String rewritten = loop.substring(0, from) + name + ".add(" + Support.source(write.element, state) + ")"
        + loop.substring(to);
    return declaration(type, name, fix, state) + "\n" + indent + rewritten + "\n" + indent
        + Support.source(write.receiver, state) + "." + write.batch + "(" + name + ");";
  }

  private static boolean declaredOutside(LoopWrite write) {
    if (!(Support.unparenthesized(write.element) instanceof IdentifierTree name)) {
      return false;
    }
    Symbol symbol = ASTHelpers.getSymbol(name);
    boolean[] inside = {false};
    new TreeScanner<Void, Void>() {
      @Override
      public Void visitVariable(VariableTree node, Void unused) {
        inside[0] |= ASTHelpers.getSymbol(node) == symbol;
        return super.visitVariable(node, unused);
      }
    }.scan(write.statement, null);
    return !inside[0];
  }

  private static String declaration(String type, String name, SuggestedFix.Builder fix, VisitorState state) {
    String list = SuggestedFixes.qualifyType(state, fix, "java.util.List");
    String arrayList = SuggestedFixes.qualifyType(state, fix, "java.util.ArrayList");
    return list + "<" + type + "> " + name + " = new " + arrayList + "<>();";
  }

  private static String typeName(Type type, SuggestedFix.Builder fix, VisitorState state) {
    String text = type.toString();
    boolean plain = type.getKind() == TypeKind.DECLARED && !type.isCompound() && type.tsym != null
        && !type.tsym.isAnonymous() && !text.contains("capture#") && !text.contains("?");
    return plain ? SuggestedFixes.prettyType(state, fix, type) : null;
  }

  private static String freshName(String write, VisitorState state) {
    return LoopEffects.freshName(write.startsWith("delete") ? "toDelete" : "toSave", state);
  }

  private static boolean single(Tree body, MethodInvocationTree call) {
    Tree only = body instanceof BlockTree block && block.getStatements().size() == 1
        ? block.getStatements().get(0) : body;
    return only == call || only instanceof ExpressionStatementTree statement && statement.getExpression() == call;
  }

  private static ExpressionTree iterated(StatementTree statement) {
    return statement instanceof ExpressionStatementTree expression
        && expression.getExpression() instanceof MethodInvocationTree call
        && call.getMethodSelect() instanceof MemberSelectTree select ? select.getExpression() : null;
  }

  private static LambdaExpressionTree lambdaOf(StatementTree statement) {
    return statement instanceof ExpressionStatementTree expression
        && expression.getExpression() instanceof MethodInvocationTree call && call.getArguments().size() == 1
        && call.getArguments().get(0) instanceof LambdaExpressionTree lambda ? lambda : null;
  }

  private static boolean isIterable(ExpressionTree tree, VisitorState state) {
    Type type = ASTHelpers.getType(tree);
    Type iterable = state.getTypes().erasure(state.getSymtab().iterableType);
    return type != null && ASTHelpers.isSubtype(state.getTypes().erasure(type), iterable, state);
  }
}
