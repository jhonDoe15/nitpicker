package ra7;
import com.sun.tools.javac.code.Symbol;
import com.sun.tools.javac.code.Symbol.ModuleSymbol;
public class H {
  interface I { default Object packge() { return null; } }
  interface J extends I { default Object x() { return I.super.packge(); } }
  static class K extends Symbol.ClassSymbol {
    K() { super(0, null, null); }
    Object a() { return K.super.packge(); }
    void b() { K.super.getEnclosedElements(); K.this.getEnclosedElements(); }
    void c() { Object.class.getName(); this.owner.enclClass().owner.enclClass(); }
  }
  static class L extends ModuleSymbol { L() { super(null, null); } boolean z() { return L.super.isStatic(); } }
}
