package e;

import static e.S26Consts.PRE;
import static e.S26ConstsBase.*;

import com.google.errorprone.annotations.concurrent.GuardedBy;

class S26ConstsBase {
  static final String BASE = "mu";
  static final String SHADOW = "lock";
}

class S26Consts {
  static final String PRE = "m";
  static final String HEX = "mu" + 0x3;
  static final String OCT = "mu" + 010;
  static final String BIN = "mu" + 0b11;
  static final String LONG = "mu" + 3L;
  static final String ESC = "mu" + '3';
  static final String SUM = "mu" + (1 + 2);
  static final String SUM2 = 1 + 2 + "mu";
  static final char CHAR = 'x';
  static final int INT = 7;
  static final boolean ON = false;
  static final String CHAINED = PRE + "u" + INT;
}

class S26ConstUse extends S26ConstsBase {
  static final String SHADOW = "mu";
  final Object mu = new Object();
  final Object mu3 = new Object();
  final Object mu8 = new Object();
  final Object mu7 = new Object();
  final Object lock = new Object();
  final Object x = new Object();
  final Object mfalse = new Object();
  final Object mu6 = new Object();
  final Object three = new Object();

  @GuardedBy(PRE + "u")
  int a;

  @GuardedBy(BASE)
  int b;

  @GuardedBy(SHADOW)
  int c;

  @GuardedBy(S26Consts.HEX)
  int d;

  @GuardedBy(S26Consts.OCT)
  int e;

  @GuardedBy(S26Consts.BIN)
  int f;

  @GuardedBy(S26Consts.LONG)
  int g;

  @GuardedBy(S26Consts.ESC)
  int h;

  @GuardedBy(S26Consts.SUM)
  int i;

  @GuardedBy(S26Consts.SUM2)
  int j;

  @GuardedBy("" + S26Consts.CHAR)
  int k;

  @GuardedBy("m" + S26Consts.ON)
  int l;

  @GuardedBy(S26Consts.CHAINED)
  int m;

  @GuardedBy(S26ConstsBase.SHADOW)
  int n;

  @GuardedBy(S26ConstUse.SHADOW)
  int o;

  class Inner {
    @GuardedBy(BASE)
    int p;

    @GuardedBy(SHADOW)
    int q;

    void f() {
      p++;
      q++;
    }
  }

  void use() {
    a++;
    b++;
    c++;
    d++;
    e++;
    f++;
    g++;
    h++;
    i++;
    j++;
    k++;
    l++;
    m++;
    n++;
    o++;
  }
}
