package f45;
import static f45.F45Sm4.imported;
import static f45.F45Sm4.*;

class F45Sm4Use {
  @SuppressWarnings("StaticQualifiedUsingExpression")
  void f(F45Sm4 x, F45Sm4Sub y) {
    imported.run();
    F45Sm4.viaType.run();
    F45Sm4Sub.viaSub.run();
    x.viaInstance.run();
    starred.run();
  }
}

class F45Sm4Sub extends F45Sm4 {}
