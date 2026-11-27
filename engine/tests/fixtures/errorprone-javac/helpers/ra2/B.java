package ra2;

import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Symbol.ClassSymbol;
import com.sun.tools.javac.code.Symbol.ModuleSymbol;
import com.sun.tools.javac.code.Symbol.PackageSymbol;
import com.sun.tools.javac.code.Symbol.MethodSymbol;
import com.sun.tools.javac.util.Name;
import com.sun.tools.javac.code.Type;
import static com.sun.tools.javac.code.Symbol.*;

public class B extends ClassSymbol {
  B(Name n, Symbol o) { super(0, n, o); }
  void f() {
    packge();
    this.packge();
    super.packge();
    Object a = this.packge();
    Object b = super.packge();
    enclClass();
    this.enclClass();
    super.enclClass();
    this.owner.enclClass();
    super.owner.enclClass();
    B.super.owner.enclClass();
    B.this.packge();
    B.this.owner.enclClass();
    getEnclosedElements();
    this.getEnclosedElements();
    super.getEnclosedElements();
    Symbol owner = this;
    owner.enclClass();
    owner.owner.enclClass();
    this.owner.owner.enclClass();
    Runnable r = () -> { this.packge(); owner.enclClass(); this.owner.enclClass(); };
    new Object() { void g() { B.this.packge(); B.this.owner.enclClass(); } };
    class L { void h() { B.this.packge(); B.super.packge(); } }
  }
  static class N extends ModuleSymbol {
    N() { super(null, null); }
    void g() {
      isStatic();
      this.isStatic();
      super.isStatic();
      boolean b = this.isStatic();
      packge();
      this.packge();
      B.N.this.isStatic();
    }
  }
  static class M extends MethodSymbol {
    M() { super(0, null, null, null); }
    void g() { this.owner.enclClass(); this.enclClass(); this.packge(); isStatic(); this.isStatic(); }
  }
  static class P extends PackageSymbol {
    P() { super(null, null); }
    void g() { this.owner.enclClass(); this.packge(); this.getEnclosedElements(); }
  }
}
