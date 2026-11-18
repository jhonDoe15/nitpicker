package nitpicker.fix;

import com.google.errorprone.VisitorState;
import com.google.errorprone.util.ASTHelpers;
import com.sun.source.tree.BinaryTree;
import com.sun.source.tree.BlockTree;
import com.sun.source.tree.ExpressionTree;
import com.sun.source.tree.IdentifierTree;
import com.sun.source.tree.LambdaExpressionTree;
import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.MethodInvocationTree;
import com.sun.source.tree.ParenthesizedTree;
import com.sun.source.tree.ReturnTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.VariableTree;
import com.sun.source.util.TreeScanner;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Type;
import com.sun.tools.javac.code.TypeTag;
import java.util.Set;
import javax.lang.model.element.ElementKind;
import javax.lang.model.type.TypeKind;

/** One stream scan of a collection for a single key, split into its parts. */
final class LookupShape {
  enum Form {
    FIND,
    ANY,
    NONE
  }

  private static final Set<String> KEY_TYPES =
      Set.of(
          "java.lang.String",
          "java.lang.Integer",
          "java.lang.Long",
          "java.lang.Short",
          "java.lang.Byte",
          "java.lang.Character",
          "java.lang.Boolean",
          "java.util.UUID");

  final MethodInvocationTree call;
  final Form form;
  final ExpressionTree collection;
  final Symbol collectionSymbol;
  final VariableTree parameter;
  final ExpressionTree key;
  final ExpressionTree probe;
  final Type keyType;
  final Type elementType;
  final String keyName;

  private LookupShape(
      MethodInvocationTree call,
      Form form,
      ExpressionTree collection,
      Symbol collectionSymbol,
      VariableTree parameter,
      ExpressionTree key,
      ExpressionTree probe,
      Type keyType,
      Type elementType) {
    this.call = call;
    this.form = form;
    this.collection = collection;
    this.collectionSymbol = collectionSymbol;
    this.parameter = parameter;
    this.key = key;
    this.probe = probe;
    this.keyType = keyType;
    this.elementType = elementType;
    this.keyName = LookupKeys.keyName(key);
  }

  static LookupShape of(MethodInvocationTree call, VisitorState state) {
    if (!(call.getMethodSelect() instanceof MemberSelectTree select)
        || !isStream(select.getExpression(), state)) {
      return null;
    }
    String name = select.getIdentifier().toString();
    if ((name.equals("findFirst") || name.equals("findAny")) && call.getArguments().isEmpty()) {
      if (!(Support.unparenthesized(select.getExpression()) instanceof MethodInvocationTree filter)
          || !(filter.getMethodSelect() instanceof MemberSelectTree filterSelect)
          || !filterSelect.getIdentifier().contentEquals("filter")
          || filter.getArguments().size() != 1
          || !(filter.getArguments().get(0) instanceof LambdaExpressionTree lambda)) {
        return null;
      }
      return build(call, Form.FIND, filterSelect.getExpression(), lambda, state);
    }
    if ((name.equals("anyMatch") || name.equals("noneMatch"))
        && call.getArguments().size() == 1
        && call.getArguments().get(0) instanceof LambdaExpressionTree lambda) {
      Form form = name.equals("anyMatch") ? Form.ANY : Form.NONE;
      return build(call, form, select.getExpression(), lambda, state);
    }
    return null;
  }

  private static boolean isStream(ExpressionTree tree, VisitorState state) {
    Type type = ASTHelpers.getType(tree);
    return type != null
        && state.getTypes().erasure(type).tsym.getQualifiedName().contentEquals("java.util.stream.Stream");
  }

  private static LookupShape build(
      MethodInvocationTree call,
      Form form,
      ExpressionTree source,
      LambdaExpressionTree lambda,
      VisitorState state) {
    if (!(Support.unparenthesized(source) instanceof MethodInvocationTree stream)
        || !(stream.getMethodSelect() instanceof MemberSelectTree streamSelect)
        || !streamSelect.getIdentifier().contentEquals("stream")
        || !stream.getArguments().isEmpty()
        || lambda.getParameters().size() != 1) {
      return null;
    }
    Symbol streamMethod = ASTHelpers.getSymbol(stream);
    ExpressionTree collection = streamSelect.getExpression();
    Symbol collectionSymbol = collectionSymbol(collection);
    ExpressionTree predicate = predicate(lambda);
    if (streamMethod == null
        || !streamMethod.owner.getQualifiedName().contentEquals("java.util.Collection")
        || collectionSymbol == null
        || predicate == null) {
      return null;
    }
    VariableTree parameter = lambda.getParameters().get(0);
    Symbol parameterSymbol = ASTHelpers.getSymbol(parameter);
    ExpressionTree[] sides = sides(predicate);
    if (parameterSymbol == null || sides == null) {
      return null;
    }
    boolean first = LookupKeys.isKey(sides[0], parameterSymbol);
    boolean second = LookupKeys.isKey(sides[1], parameterSymbol);
    if (first == second) {
      return null;
    }
    ExpressionTree key = first ? sides[0] : sides[1];
    ExpressionTree probe = first ? sides[1] : sides[0];
    Type keyType = ASTHelpers.getType(key);
    Type probeType = ASTHelpers.getType(probe);
    Type element = parameterSymbol.type;
    if (keyType == null
        || probeType == null
        || !plainType(element)
        || !Support.stableValue(element, state)
        || !LookupKeys.isPure(probe, collectionSymbol, parameterSymbol)
        || !sameKind(predicate, keyType, probeType, state)) {
      return null;
    }
    Type boxedKey = keyType.isPrimitive() ? state.getTypes().boxedClass(keyType).type : keyType;
    return new LookupShape(call, form, collection, collectionSymbol, parameter, key, probe, boxedKey, element);
  }

  private static ExpressionTree predicate(LambdaExpressionTree lambda) {
    if (lambda.getBodyKind() == LambdaExpressionTree.BodyKind.EXPRESSION) {
      return Support.unparenthesized((ExpressionTree) lambda.getBody());
    }
    BlockTree block = (BlockTree) lambda.getBody();
    if (block.getStatements().size() == 1
        && block.getStatements().get(0) instanceof ReturnTree ret
        && ret.getExpression() != null) {
      return Support.unparenthesized(ret.getExpression());
    }
    return null;
  }

  private static ExpressionTree[] sides(ExpressionTree predicate) {
    if (predicate instanceof BinaryTree binary && binary.getKind() == Tree.Kind.EQUAL_TO) {
      return new ExpressionTree[] {
        Support.unparenthesized(binary.getLeftOperand()), Support.unparenthesized(binary.getRightOperand())
      };
    }
    if (predicate instanceof MethodInvocationTree equals
        && equals.getMethodSelect() instanceof MemberSelectTree select
        && select.getIdentifier().contentEquals("equals")
        && equals.getArguments().size() == 1) {
      Symbol method = ASTHelpers.getSymbol(equals);
      if (method != null && !method.isStatic()) {
        return new ExpressionTree[] {
          Support.unparenthesized(select.getExpression()), Support.unparenthesized(equals.getArguments().get(0))
        };
      }
    }
    return null;
  }

  private static boolean sameKind(
      ExpressionTree predicate, Type keyType, Type probeType, VisitorState state) {
    if (predicate instanceof BinaryTree) {
      Type left = state.getTypes().unboxedTypeOrType(keyType);
      Type right = state.getTypes().unboxedTypeOrType(probeType);
      return (keyType.isPrimitive() || probeType.isPrimitive())
          && left.isPrimitive()
          && right.isPrimitive()
          && left.getTag() == right.getTag()
          && left.getTag() != TypeTag.FLOAT
          && left.getTag() != TypeTag.DOUBLE;
    }
    return hashable(keyType, state) && hashable(probeType, state);
  }

  private static boolean hashable(Type type, VisitorState state) {
    Type boxed = type.isPrimitive() ? state.getTypes().boxedClass(type).type : type;
    return boxed.tsym != null
        && (KEY_TYPES.contains(boxed.tsym.getQualifiedName().toString())
            || boxed.tsym.getKind() == ElementKind.ENUM);
  }

  private static boolean plainType(Type type) {
    return type != null && type.getKind() == TypeKind.DECLARED && !hasCapture(type);
  }

  private static boolean hasCapture(Type type) {
    if (type instanceof Type.CapturedType || type.getKind() == TypeKind.WILDCARD) {
      return true;
    }
    if (type.tsym != null && type.tsym.name.isEmpty()) {
      return true;
    }
    for (Type argument : type.getTypeArguments()) {
      if (hasCapture(argument)) {
        return true;
      }
    }
    return false;
  }

  private static Symbol collectionSymbol(ExpressionTree tree) {
    ExpressionTree plain = Support.unparenthesized(tree);
    boolean named =
        plain instanceof IdentifierTree
            || plain instanceof MemberSelectTree select
                && select.getExpression() instanceof IdentifierTree owner
                && owner.getName().contentEquals("this");
    Symbol symbol = named ? ASTHelpers.getSymbol(plain) : null;
    return symbol instanceof Symbol.VarSymbol ? symbol : null;
  }
}
