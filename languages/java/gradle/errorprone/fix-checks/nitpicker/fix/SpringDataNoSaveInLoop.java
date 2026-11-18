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
    String text = whole != null ? whole : collected(write, fix, state);
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
    Symbol.MethodSymbol write = (Symbol.MethodSymbol) ASTHelpers.getSymbol(reference);
    if (write == null || write.getParameters().size() != 1) {
      return null;
    }
    Type element = elementOfStream(select.getExpression(), state);
    SuggestedFix.Builder fix = SuggestedFix.builder();
    String name = freshName(reference.getName().toString(), state);
    String type = element == null ? null : typeName(element, fix, state);
    if (type == null) {
      return null;
    }
    String indent = Support.indentAt(Support.start(statement), state);
    String loop = Support.source(statement, state);
    int offset = Support.start(reference) - Support.start(statement);
    String rewritten = loop.substring(0, offset) + name + "::add"
        + loop.substring(offset + Support.source(reference, state).length());
    String text = declaration(type, name, fix, state) + "\n" + indent + rewritten + "\n" + indent + repository + "."
        + batch + "(" + name + ");";
    return describeMatch(statement, fix.replace(statement, text).build());
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
      if (receiver == null || lambda == null || !isIterable(receiver, state) || lambda.getParameters().size() != 1) {
        return null;
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

  private static String collected(LoopWrite write, SuggestedFix.Builder fix, VisitorState state) {
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

  private static Type elementOfStream(ExpressionTree stream, VisitorState state) {
    Type type = ASTHelpers.getType(stream);
    Type base = state.getTypeFromString("java.util.stream.Stream");
    Type asStream = type == null || base == null ? null : state.getTypes().asSuper(type, base.tsym);
    return asStream == null || asStream.getTypeArguments().size() != 1 ? null : asStream.getTypeArguments().get(0);
  }
}
