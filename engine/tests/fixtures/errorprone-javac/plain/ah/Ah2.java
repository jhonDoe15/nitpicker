package ah;

import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Symbol.ClassSymbol;

class Ah2 {
  void f(ClassSymbol symbol, Symbol s) {
    ClassSymbol enclosing = symbol.owner.enclClass();
    s.packge();
    s.isStatic();
  }
}
