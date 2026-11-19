package demo;

public class Concatenations {
  String right(int count, long total, String label) {
    return "n=" + count + ", total=" + total + label;
  }

  String left(int count) {
    return count + "!";
  }

  String lowerOperands(int first, int second, boolean flag) {
    return "sum=" + (first + second) + (first < second) + "|"
        + (flag ? 1 : 2);
  }

  String leftOperand(int first, int second) {
    return first + second + "|" + (first < second) + "|";
  }

  String stringArgument(String name) {
    return 1 + name + 2;
  }

  String twoCalls(int first, int second) {
    return String.valueOf(first) + second;
  }

  String arrayArgument(char[] chars, int[] numbers) {
    return "chars=" + String.valueOf(chars) + String.valueOf(numbers) + "|";
  }

  String numericOperand(int first, int second) {
    return first + second + String.valueOf(first);
  }

  String builder(StringBuilder builder, StringBuffer buffer, int count, char[] chars) {
    builder.append(String.valueOf(count));
    buffer.append(String.valueOf(chars));
    return builder.append(String.valueOf(chars)).toString() + buffer;
  }

  String commentedArgument(int count) {
    return String.valueOf(/* why */ count) + "!";
  }
}
