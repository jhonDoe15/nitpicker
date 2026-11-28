package e;

import javax.annotation.concurrent.GuardedBy;

// test: inherited slock


class Super_bnd1 {
  final Object slock = new Object();
}

class Test_bnd1 extends Super_bnd1 {
  @GuardedBy("slock")
  int guarded_bnd;
}

// test: finalCase lock


class Test_bnd2 {
  @GuardedBy("lock")
  int guarded_bnd;

  final Object lock = new Object();
}

// test: method s.f.g().f.g().lock


class Super_bnd3 {
  final Super_bnd3 f = null;

  Super_bnd3 g() {
    return null;
  }

  final Object lock = new Object();
}

class Test_bnd3 {
  @GuardedBy("s.f.g().f.g().lock")
  int guarded_bnd;

  final Super_bnd3 s = null;
}

// test: badSuperAccess Super.this.lock


class Super_bnd4 {}

class Test_bnd4 extends Super_bnd4 {
  @GuardedBy("Super_bnd4.this.lock")
  int guarded_bnd;

  final Object lock = new Object();
}

// test: namedClass_this Test.class


class Test_bnd5 {
  @GuardedBy("Test_bnd5.class")
  int guarded_bnd;
}

// test: namedClass_super Super.class


class Super_bnd6 {}

class Test_bnd6 extends Super_bnd6 {
  @GuardedBy("Super_bnd6.class")
  int guarded_bnd;
}

// test: namedClass_nonLiteral t.class


class Super_bnd7 {}

class Test_bnd7 extends Super_bnd7 {
  @GuardedBy("t.class")
  int guarded_bnd;

  Test_bnd7 t;
}

// test: namedClass_none Super.class


class Test_bnd8 {
  @GuardedBy("Super.class")
  int guarded_bnd;
}

// test: namedThis_none Segment.this


class Test_bnd9 {
  @GuardedBy("Segment.this")
  int guarded_bnd;
}

// test: outer_lock Outer.this.lock


class Outer_bnd10 {
  final Object lock = new Object();

  class Test_bnd10 {
  @GuardedBy("Outer_bnd10.this.lock")
  int guarded_bnd;
}
}

// test: outer_lock_simpleName lock


class Outer_bnd11 {
  final Object lock = new Object();

  class Test_bnd11 {
  @GuardedBy("lock")
  int guarded_bnd;
}
}

// test: otherClass Other.lock


class Other_bnd12 {
  static final Object lock = new Object();
}

class Test_bnd12 {
  @GuardedBy("Other_bnd12.lock")
  int guarded_bnd;
}

// test: simpleName Other.lock


class Other_bnd13 {
  static final Object lock = new Object();
}

class Test_bnd13 {
  @GuardedBy("Other_bnd13.lock")
  int guarded_bnd;

  final Other_bnd13 Other_bnd13 = null;
}

// test: simpleNameClass Other.class


class Other_bnd14 {
  static final Object lock = new Object();
}

class Test_bnd14 {
  @GuardedBy("Other_bnd14.class")
  int guarded_bnd;

  Other_bnd14 Other_bnd14 = null;
}

// test: simpleFieldName Other


class Other_bnd15 {
  static final Object lock = new Object();
}

class Test_bnd15 {
  @GuardedBy("Other_bnd15")
  int guarded_bnd;

  final Object Other_bnd15 = null;
}

// test: staticFieldGuard lock


class Test_bnd16 {
  @GuardedBy("lock")
  int guarded_bnd;

  static final Object lock = new Object();
}

// test: staticMethodGuard lock()


class Test_bnd17 {
  @GuardedBy("lock()")
  int guarded_bnd;

  static Object lock() {
    return null;
  }
}

// test: staticOnStatic Test.lock


class Test_bnd18 {
  @GuardedBy("Test_bnd18.lock")
  int guarded_bnd;

  static final Object lock = new Object();
}

// test: instanceOnStatic Test.lock


class Test_bnd19 {
  @GuardedBy("Test_bnd19.lock")
  int guarded_bnd;

  final Object lock = new Object();
}

// test: instanceMethodOnStatic Test.lock()


class Test_bnd20 {
  @GuardedBy("Test_bnd20.lock()")
  int guarded_bnd;

  final Object lock() {
    return null;
  }
}

// test: explicitThisOuterClass this.lock


class Outer_bnd21 {
  Object lock;

  class Inner_bnd21 {
  @GuardedBy("this.lock")
  int guarded_bnd;

    int x;
  }
}

// test: implicitThisOuterClass lock


class Outer_bnd22 {
  Object lock;

  class Inner_bnd22 {
  @GuardedBy("lock")
  int guarded_bnd;

    int x;
  }
}

// test: implicitThisOuterClassMethod endpoint().lock()


class Outer_bnd23 {
  class Endpoint_bnd23 {
    Object lock() {
      return null;
    }
  }

  Endpoint_bnd23 endpoint() {
    return null;
  }

  class Inner_bnd23 {
  @GuardedBy("endpoint().lock()")
  int guarded_bnd;

    int x;
  }
}

// test: explicitThisSameClass Test.this


class Test_bnd24 {
  @GuardedBy("Test_bnd24.this")
  int guarded_bnd;
}

// test: nonFinalStatic Other.lock


class Other_bnd25 {
  static Object lock = new Object();
}

class Test_bnd25 {
  @GuardedBy("Other_bnd25.lock")
  int guarded_bnd;

  final Other_bnd25 Other_bnd25 = null;
}

// test: nonFinal lock


class Test_bnd26 {
  @GuardedBy("lock")
  int guarded_bnd;

  Object lock = new Object();
}

