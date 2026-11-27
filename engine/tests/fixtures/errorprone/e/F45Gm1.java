package e;

import com.google.inject.AbstractModule;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

class F45Gm1 extends AbstractModule {
  int initialized = 1;
  int written = 1;
  int blank;
  int inCtor;
  int twice;
  int viaThis;
  int readFirst;
  int inBlock;
  static int shared;
  final int done = 1;
  List<String> names = new ArrayList<>();
  final Map<String, Integer> counts = null;
  ArrayList<String> raw;
  Object any = new Object();
  private int a, b = 2;

  { inBlock = 3; }

  F45Gm1() {
    inCtor = 1;
    twice = 1;
    twice = 2;
    this.viaThis = 4;
    System.out.println(readFirst);
    readFirst = 5;
    raw = null;
    a = 1;
  }

  F45Gm1(int unused) {
    this();
  }

  void change() {
    written = 2;
  }

  @Override
  protected void configure() {}
}

class F45Gm1Other {
  void f(F45Gm2 module) {
    module.foreign = 3;
  }
}

class F45Gm2 extends F45Gm1 {
  int foreign;
  int incremented = 0;
  int lambdaWrite;
  int noCtor;
  { noCtor = 1; }

  void g() {
    incremented++;
    Runnable r = () -> lambdaWrite = 1;
  }
}

abstract class F45Gm3 extends AbstractModule {
  int set;
  int local = 1;

  F45Gm3(int set) {
    this.set = set;
    int local = 2;
    local = 3;
  }
}
