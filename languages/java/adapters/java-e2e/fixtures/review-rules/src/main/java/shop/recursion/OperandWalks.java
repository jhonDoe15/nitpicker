package shop.recursion;

public final class OperandWalks {
  private OperandWalks() {}

  public interface Expr {
    Expr getLeft();

    Expr getRight();

    boolean isBinary();

    int value();
  }

  public static int evaluate(Expr node) {
    if (node.isBinary()) {
      return evaluate(node.getLeft()) + evaluate(node.getRight()); // violation: OperandDepthRecursion
    }
    return node.value();
  }

  public static int bounded(Expr node, int depth) {
    if (depth > 200) {
      throw new IllegalStateException("expression nests too deep");
    }
    return node.isBinary() ? bounded(node.getLeft(), depth + 1) + bounded(node.getRight(), depth + 1) : node.value();
  }

  public static int rightOnly(Expr node) {
    int total = 0;
    Expr current = node;
    while (current.isBinary()) {
      total += rightOnly(current.getRight());
      current = current.getLeft();
    }
    return total + current.value();
  }
}
