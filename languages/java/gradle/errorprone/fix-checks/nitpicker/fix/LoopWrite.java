package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.EnhancedForLoopTree;
import com.sun.source.tree.ExpressionStatementTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.ForLoopTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.IfTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.StatementTree;
import com.sun.source.tree.Tree;
import com.sun.source.util.TreePath;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Symbol.MethodSymbol;
import com.sun.tools.javac.code.Type;
import java.util.List;
import java.util.Map;
import java.util.Set;
import javax.lang.model.element.ElementKind;
import javax.lang.model.type.TypeKind;

final class LoopWrite {
  static final String REPOSITORY = "org.springframework.data.repository.Repository";
  static final Map<String, String> BATCHES = Map.of(
      "save", "saveAll",
      "saveAndFlush", "saveAllAndFlush",
      "delete", "deleteAll",
      "deleteById", "deleteAllById");
  private static final Set<String> ONE_ELEMENT_BATCHES =
      Set.of("saveAll", "saveAllAndFlush", "deleteAll", "deleteAllById", "deleteAllInBatch");
  private static final Set<String> ONE_ELEMENT_FACTORIES = Set.of(
      "java.util.List.of", "java.util.Set.of", "java.util.Collections.singletonList",
      "java.util.Collections.singleton");
  private static final Set<String> ITERATING = Set.of("forEach", "forEachOrdered");

  final MethodInvocationTree call;
  final ExpressionTree receiver;
  final ExpressionTree element;
  final String batch;
  final Tree loop;
  final StatementTree statement;
  final Tree body;

  private LoopWrite(MethodInvocationTree call, ExpressionTree element, String batch, Tree loop,
      StatementTree statement, Tree body) {
    this.call = call;
    this.receiver = ((MemberSelectTree) call.getMethodSelect()).getExpression();
    this.element = element;
    this.batch = batch;
    this.loop = loop;
    this.statement = statement;
    this.body = body;
  }

  static LoopWrite of(MethodInvocationTree call, VisitorState state, boolean oneElement) {
    if (!(call.getMethodSelect() instanceof MemberSelectTree select) || call.getArguments().size() != 1
        || !isRepository(select.getExpression(), state) || !stable(select.getExpression())) {
      return null;
    }
    String name = select.getIdentifier().toString();
    ExpressionTree element = oneElement
        ? ONE_ELEMENT_BATCHES.contains(name) ? oneElement(call.getArguments().get(0), state) : null
        : BATCHES.containsKey(name) ? call.getArguments().get(0) : null;
    String batch = BATCHES.getOrDefault(name, name);
    if (element == null || !hasBatch(select.getExpression(), batch, state)) {
      return null;
    }
    TreePath path = state.getPath();
    Tree parent = path.getParentPath().getLeaf();
    boolean expressionBody = parent instanceof LambdaExpressionTree lambda && lambda.getBody() == call;
    if (!(parent instanceof ExpressionStatementTree) && !expressionBody) {
      return null;
    }
    TreePath start = expressionBody ? path : path.getParentPath();
    for (TreePath at = start.getParentPath(); at != null; at = at.getParentPath()) {
      Tree leaf = at.getLeaf();
      if (leaf instanceof EnhancedForLoopTree loop) {
        return lastInPass(start, loop.getStatement()) ? of(call, element, batch, at, loop.getStatement()) : null;
      }
      if (leaf instanceof ForLoopTree loop) {
        return simpleFor(loop) && lastInPass(start, loop.getStatement())
            ? of(call, element, batch, at, loop.getStatement()) : null;
      }
      if (leaf instanceof LambdaExpressionTree lambda) {
        TreePath statement = iteratingStatement(at, state);
        return statement != null && lastInPass(start, lambda.getBody())
            ? of(call, element, batch, statement, lambda.getBody()) : null;
      }
      if (leaf instanceof StatementTree && !(leaf instanceof BlockTree) && !(leaf instanceof IfTree)
          && !(leaf instanceof ExpressionStatementTree)) {
        return null;
      }
      if (leaf.getKind() == Tree.Kind.METHOD || leaf.getKind() == Tree.Kind.CLASS) {
        return null;
      }
    }
    return null;
  }

  private static LoopWrite of(MethodInvocationTree call, ExpressionTree element, String batch, TreePath loop,
      Tree body) {
    if (!(loop.getParentPath().getLeaf() instanceof BlockTree)) {
      return null;
    }
    return new LoopWrite(call, element, batch, loop.getLeaf(), (StatementTree) loop.getLeaf(), body);
  }

  static boolean isRepository(ExpressionTree receiver, VisitorState state) {
    Type type = ASTHelpers.getType(receiver);
    Type repository = state.getTypeFromString(REPOSITORY);
    return type != null && repository != null && ASTHelpers.isSubtype(type, repository, state);
  }

  static boolean stable(ExpressionTree receiver) {
    Symbol symbol = ASTHelpers.getSymbol(receiver);
    boolean field = symbol != null && symbol.getKind() == ElementKind.FIELD;
    boolean local = symbol != null && (symbol.getKind() == ElementKind.LOCAL_VARIABLE
        || symbol.getKind() == ElementKind.PARAMETER) && LoopEffects.effectivelyFinal(symbol);
    boolean plain = receiver instanceof IdentifierTree
        || receiver instanceof MemberSelectTree select && select.getExpression() instanceof IdentifierTree self
            && self.getName().contentEquals("this");
    return plain && (field || local);
  }

  private static boolean hasBatch(ExpressionTree receiver, String batch, VisitorState state) {
    Type type = ASTHelpers.getType(receiver);
    Type iterable = state.getTypes().erasure(state.getSymtab().iterableType);
    for (Symbol member : state.getTypes().membersClosure(type, false).getSymbolsByName(state.getName(batch))) {
      if (member instanceof MethodSymbol method && method.getParameters().size() == 1
          && state.getTypes().isSameType(state.getTypes().erasure(method.getParameters().get(0).type), iterable)) {
        return true;
      }
    }
    return false;
  }

  private static ExpressionTree oneElement(ExpressionTree argument, VisitorState state) {
    if (!(Support.unparenthesized(argument) instanceof MethodInvocationTree factory)
        || factory.getArguments().size() != 1) {
      return null;
    }
    MethodSymbol method = ASTHelpers.getSymbol(factory);
    String name = method == null ? "" : method.owner.getQualifiedName() + "." + method.getSimpleName();
    Type only = ASTHelpers.getType(factory.getArguments().get(0));
    boolean array = only == null || only.getKind() == TypeKind.ARRAY;
    return ONE_ELEMENT_FACTORIES.contains(name) && (!method.isVarArgs() || !array)
        ? factory.getArguments().get(0) : null;
  }

  private static boolean simpleFor(ForLoopTree loop) {
    return !LoopEffects.callsAnything(loop.getCondition()) && loop.getUpdate().stream()
        .noneMatch(update -> LoopEffects.callsAnything(update.getExpression()));
  }

  private static TreePath iteratingStatement(TreePath lambdaPath, VisitorState state) {
    TreePath callPath = lambdaPath.getParentPath();
    if (!(callPath.getLeaf() instanceof MethodInvocationTree iterate)
        || !(iterate.getMethodSelect() instanceof MemberSelectTree select)
        || !ITERATING.contains(select.getIdentifier().toString()) || iterate.getArguments().size() != 1
        || !(callPath.getParentPath().getLeaf() instanceof ExpressionStatementTree)) {
      return null;
    }
    return LoopEffects.iterates(select.getExpression(), state) ? callPath.getParentPath() : null;
  }

  private static boolean lastInPass(TreePath start, Tree body) {
    TreePath at = start;
    while (at.getLeaf() != body) {
      Tree leaf = at.getLeaf();
      Tree parent = at.getParentPath().getLeaf();
      if (parent instanceof BlockTree block) {
        List<? extends StatementTree> statements = block.getStatements();
        if (statements.isEmpty() || statements.get(statements.size() - 1) != leaf) {
          return false;
        }
      } else if (!(parent instanceof IfTree branch) || branch.getCondition() == leaf) {
        return false;
      }
      at = at.getParentPath();
    }
    return true;
  }
}
