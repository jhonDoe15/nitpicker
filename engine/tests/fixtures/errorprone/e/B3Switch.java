public class B3Switch {
  enum Case {
    ONE,
    TWO,
    THREE
  }

  enum Big {
    A,
    B,
    C,
    D,
    E,
    F,
    G
  }

  void missing(Case c) {
    switch (c) {
      case ONE:
        break;
    }
  }

  void missingRule(Case c) {
    switch (c) {
      case ONE, TWO -> System.out.println();
    }
  }

  void all(Case c) {
    switch (c) {
      case ONE:
      case TWO:
      case THREE:
        break;
    }
  }

  void withDefault(Case c) {
    switch (c) {
      case ONE:
        break;
      default:
        break;
    }
  }

  void skew(Case c) {
    switch (c) {
      case ONE:
        break;
      case TWO:
        break;
      default:
        // Handle version skew
        break;
    }
  }

  void skewFirst(Case c) {
    switch (c) {
      default /* skew */ -> {}
    }
  }

  void many(Big b) {
    switch (b) {
      case A -> {}
      default -> {}
    }
    switch (b) {
      case A:
        break;
      case B:
        break;
    }
    switch (b) {
      case A:
      case B:
      case C:
      case D:
        break;
    }
  }

  int expr(Case c) {
    return switch (c) {
      case ONE -> 1;
      case TWO -> 2;
      case THREE -> 3;
    };
  }

  int exprSkew(Case c) {
    return switch (c) {
      case ONE -> 1;
      // skew
      default -> 3;
    };
  }

  int exprDefault(Case c) {
    return switch (c) {
      case ONE -> 1;
      default -> 3;
    };
  }

  void pattern(Case c) {
    switch (c) {
      case Case x -> {}
    }
    switch (c) {
      case Case x when x == Case.ONE -> {}
      case ONE -> {}
      case TWO, THREE -> {}
    }
  }

  void notEnum(int i, String s) {
    switch (i) {
      case 1:
        break;
    }
    switch (s) {
      case "a":
        break;
    }
  }

  void qualified(Case c) {
    switch (c) {
      case ONE -> {}
      case Case.TWO -> {}
    }
  }

  @SuppressWarnings("MissingCasesInEnumSwitch")
  void suppressed(Case c) {
    switch (c) {
      case ONE:
        break;
    }
  }
}
