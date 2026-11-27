package ah;

import com.sun.tools.javac.code.Symbol;

class Ah3 {
  Object yielded(Symbol s, int k) {
    return switch (k) {
      case 1 -> s.packge();
      case 2 -> {
        s.packge();
        yield s.packge();
      }
      default -> null;
    };
  }

  void statement(Symbol s, int k) {
    switch (k) {
      case 1 -> s.packge();
      default -> {}
    }
  }

  void loops(Symbol s) {
    for (s.packge(); ; s.packge()) {
      break;
    }
    for (s.packge(), s.packge(); s.packge() != null; s.packge(), s.packge()) {}
    for (Object x = s.packge(); x != null; ) {}
  }
}
