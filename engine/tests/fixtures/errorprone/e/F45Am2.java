package e;

import static org.junit.Assert.assertThrows;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

public class F45Am2 {
  static Object make() { return null; }
  static <T> T any() { return null; }
  static int checked() throws IOException { return 1; }
  static int thrower() throws Exception { return 1; }
  void take(Runnable r) {}
  void takeList(List<String> list) {}
  void takeMap(Map<String, ? extends Number> map) {}
  void takeArr(int[][] values) {}
  void takeObj(Object o) {}
  static List<String> list() { return null; }

  void jdkValueOf() {
    assertThrows(IllegalStateException.class, () -> String.valueOf(make()));
  }

  void jdkParse() {
    assertThrows(IllegalStateException.class, () -> Integer.parseInt(String.valueOf(make())));
  }

  void jdkInstance() {
    assertThrows(IllegalStateException.class, () -> new ArrayList<Object>().add(make()));
  }

  void supplier() {
    Supplier<Object> s = () -> null;
    assertThrows(IllegalStateException.class, () -> s.get().hashCode());
  }

  void lambdaParam(Object o) {
    assertThrows(IllegalStateException.class, () -> takeObj(make()));
  }

  void param(Object o, Object o2) {
    assertThrows(IllegalStateException.class, () -> takeObj(make()));
  }

  void generic() {
    assertThrows(IllegalStateException.class, () -> takeList(list()));
  }

  void diamond() {
    assertThrows(IllegalStateException.class, () -> takeList(new ArrayList<>()));
  }

  void typed() {
    assertThrows(IllegalStateException.class, () -> takeList(new ArrayList<String>()));
  }

  void arrays() {
    assertThrows(IllegalStateException.class, () -> takeArr(new int[make().hashCode()][]));
  }

  void castNarrow() {
    assertThrows(IllegalStateException.class, () -> takeList((List<String>) make()));
  }

  void castWide() {
    assertThrows(IllegalStateException.class, () -> takeObj((Object) list()));
  }

  void throwable() {
    assertThrows(IllegalStateException.class, () -> takeObj(thrower()));
  }

  void throwableMix() throws Exception {
    assertThrows(Exception.class, () -> takeObj(thrower()));
  }

  void anonymous() {
    assertThrows(IllegalStateException.class, () -> take(new Runnable() { int x = 1; public void run() {} }));
  }

  void mapEntry(Map<String, String> m) {
    assertThrows(IllegalStateException.class, () -> takeObj(m.entrySet().iterator().next()));
  }

  void comment() {
    assertThrows(IllegalStateException.class, () -> takeObj(make() // why
    ));
  }

  void paren() {
    assertThrows(IllegalStateException.class, () -> takeObj((make())));
  }

  void ternary(boolean b) {
    assertThrows(IllegalStateException.class, () -> takeObj(b ? make() : null));
  }

  void concat() {
    assertThrows(IllegalStateException.class, () -> takeObj("a" + make()));
  }

  void superCall() {
    assertThrows(IllegalStateException.class, () -> super.equals(make()));
  }

  F45Am2() {
    assertThrows(IllegalStateException.class, () -> takeObj(make()));
  }
}
