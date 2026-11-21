package rare;

import java.io.Serializable;
import java.util.Map;

sealed interface Shape permits Circle, Square, Group {}

record Circle(double radius) implements Shape {}

record Square(double side) implements Shape {}

sealed interface Group extends Shape permits Pair, Triple {}

record Pair(Shape first, Shape second) implements Group {}

record Triple(Shape first, Shape second, Shape third) implements Group {}

enum Level {
  LOW,
  MIDDLE,
  HIGH
}

class Switches implements Serializable {
  @SuppressWarnings("serial")
  static class Quiet implements Serializable {}

  static class Loud implements Serializable {}

  int allConstants(Level level) {
    return switch (level) {
      case LOW -> 1;
      case MIDDLE -> 2;
      case HIGH -> 3;
      default -> 0;
    };
  }

  int someConstants(Level level) {
    switch (level) {
      case LOW:
        return 1;
      case HIGH:
        return 3;
      default:
        return 0;
    }
  }

  int noDefault(Level level) {
    switch (level) {
      case LOW:
        return 1;
      case MIDDLE:
        break;
    }
    return 0;
  }

  int nullAndDefault(Level level) {
    return switch (level) {
      case LOW, MIDDLE -> 1;
      case HIGH -> 2;
      case null, default -> 0;
    };
  }

  double sealedWithDefault(Shape shape) {
    return switch (shape) {
      case Circle circle -> circle.radius();
      case Square square -> square.side();
      case Group group -> 2;
      default -> 0;
    };
  }

  double sealedNested(Shape shape) {
    return switch (shape) {
      case Circle circle -> circle.radius();
      case Square square -> square.side();
      case Pair pair -> 2;
      case Triple triple -> 3;
      default -> 0;
    };
  }

  double sealedOpen(Shape shape) {
    return switch (shape) {
      case Circle circle -> circle.radius();
      case Pair pair -> 2;
      default -> 0;
    };
  }

  double sealedChecked(Shape shape) {
    return switch (shape) {
      case Circle circle -> circle.radius();
      case Square square -> square.side();
      case Group group -> 2;
    };
  }

  String literals(int count, String name, Map.Entry<String, Integer> entry) {
    if (count == 7 || "x".equals(name) || count > -3) {
      return name;
    }
    if (count == 1 || entry.getValue() == 2) {
      return entry.getKey();
    }
    if (name == null || count == -1) {
      return "";
    }
    return name;
  }

  int[] arrays(int[] source, int[] target, int offset) {
    for (int i = 0; i < source.length; i++) {
      target[i] = source[i];
    }
    for (int i = 0; i < source.length; i++) {
      target[i - offset] = source[i];
    }
    return target;
  }
}
