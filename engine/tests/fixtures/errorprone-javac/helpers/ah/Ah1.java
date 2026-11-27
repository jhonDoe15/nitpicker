package ah;

import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Symbol.ClassSymbol;
import com.sun.tools.javac.code.Symbol.ModuleSymbol;
import com.sun.tools.javac.code.Symbol.PackageSymbol;
import com.sun.tools.javac.code.Symbol.TypeSymbol;
import com.sun.tools.javac.code.Symbol.VarSymbol;
import com.sun.tools.javac.util.Name;
import java.util.List;
import java.util.function.Function;

class Ah1 {
  Symbol field;

  void f(Symbol s) {
    s.isStatic();
    s.packge();
  }

  void g(VarSymbol s) {
    s.isStatic();
    s.packge();
  }

  void chained(Symbol s) {
    Name n = s.packge().fullname;
    PackageSymbol p = s.packge();
    h(s.packge());
    Object o = (s.packge());
    (s.packge()).toString();
  }

  void h(PackageSymbol p) {}

  PackageSymbol returned(Symbol s) {
    return s.packge();
  }

  void enclosed(ClassSymbol s) {
    s.getEnclosedElements();
    List<Symbol> all = s.getEnclosedElements();
    ClassSymbol enclosing = s.owner.enclClass();
    ClassSymbol twice = s.owner.owner.enclClass();
    ClassSymbol wrapped = (s.owner).enclClass();
    ClassSymbol self = s.enclClass();
    ClassSymbol held = this.field.owner.enclClass();
    ClassSymbol bare = field.owner.enclClass();
  }

  void modules(ModuleSymbol m, TypeSymbol t, ClassSymbol c, PackageSymbol p) {
    m.isStatic();
    t.isStatic();
    c.isStatic();
    p.isStatic();
    boolean b = m.isStatic() && t.isStatic();
  }

  <T extends Symbol> void generic(T t, List<? extends Symbol> list) {
    t.packge();
    t.isStatic();
    list.get(0).packge();
  }

  void lines(Symbol s) {
    s
        .packge();
    Object x =
        s.packge()
            .toString();
    s.packge(); // trailing
    Function<Symbol, PackageSymbol> ref = Symbol::packge;
  }

  @SuppressWarnings("ASTHelpersSuggestions")
  void suppressed(Symbol s) {
    s.packge();
  }

  class Inner {
    void f(Symbol s) {
      s.packge();
      new Object() {
        void g() {
          s.getEnclosedElements();
        }
      };
    }
  }
}
