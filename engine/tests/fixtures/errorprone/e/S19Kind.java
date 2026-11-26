package e;

import static com.sun.source.tree.Tree.Kind.MEMBER_SELECT;

import com.sun.source.tree.MemberSelectTree;
import com.sun.source.tree.Tree;
import com.sun.source.tree.Tree.Kind;

class S19Kind {
  boolean isMemberSelect(Tree tree) {
    return tree.getKind() == Tree.Kind.MEMBER_SELECT;
  }

  boolean instanceEquals(Tree tree) {
    return tree.getKind().equals(Tree.Kind.MEMBER_SELECT);
  }

  boolean instanceEqualsNegated(Tree tree) {
    return !tree.getKind().equals(Tree.Kind.MEMBER_SELECT);
  }

  boolean negated(Tree tree) {
    return tree.getKind() != Tree.Kind.MEMBER_SELECT;
  }

  boolean multipleResolveToBinaryTree(Tree tree) {
    return tree.getKind() == Tree.Kind.EQUAL_TO;
  }

  boolean comparedToWrongType(Tree tree) {
    return tree.getKind().equals(1);
  }

  boolean imported(Tree tree) {
    return tree.getKind() == Kind.METHOD_INVOCATION || tree.getKind() == MEMBER_SELECT;
  }

  boolean reversed(Tree tree) {
    return Kind.METHOD_INVOCATION == tree.getKind();
  }

  boolean viaSubtype(MemberSelectTree tree) {
    return tree.getKind() == Kind.IDENTIFIER;
  }

  boolean chained(S19Kind other, Tree tree) {
    return other.get(tree).getKind() == Kind.NEW_CLASS;
  }

  Tree get(Tree tree) {
    return tree;
  }

  boolean parenthesized(Tree tree) {
    return (tree.getKind() == Kind.LAMBDA_EXPRESSION) && !(tree.getKind().equals(Kind.TRY));
  }

  boolean other(Tree tree, Kind kind) {
    return tree.getKind() == kind || tree.getKind() == Kind.OTHER || tree.getKind().equals(kind);
  }

  boolean ordinary(Object o, Thread.State state) {
    return state == Thread.State.NEW || o.equals(Thread.State.NEW);
  }

  boolean nullReceiver() {
    return kind() == Kind.CLASS;
  }

  Kind kind() {
    return null;
  }

  @SuppressWarnings("PreferInstanceofOverGetKind")
  boolean suppressed(Tree tree) {
    return tree.getKind() == Kind.BLOCK;
  }
}
