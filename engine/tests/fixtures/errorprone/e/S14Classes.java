package e;

import java.io.Serializable;
import java.lang.annotation.Annotation;

class S14AnnoNoMethods implements Annotation {
  @Override
  public Class<? extends Annotation> annotationType() {
    return S14AnnoNoMethods.class;
  }
}

class S14AnnoEqualsOnly implements Annotation {
  @Override
  public Class<? extends Annotation> annotationType() {
    return S14AnnoEqualsOnly.class;
  }

  @Override
  public boolean equals(Object other) {
    return false;
  }
}

class S14AnnoHashOnly implements Annotation {
  @Override
  public Class<? extends Annotation> annotationType() {
    return S14AnnoHashOnly.class;
  }

  @Override
  public int hashCode() {
    return 0;
  }
}

class S14AnnoWrongEquals implements Annotation {
  @Override
  public Class<? extends Annotation> annotationType() {
    return S14AnnoWrongEquals.class;
  }

  public boolean equals(S14AnnoWrongEquals other) {
    return false;
  }

  @Override
  public int hashCode() {
    return 0;
  }
}

class S14AnnoWrongHash implements Annotation {
  @Override
  public Class<? extends Annotation> annotationType() {
    return S14AnnoWrongHash.class;
  }

  @Override
  public boolean equals(Object other) {
    return false;
  }

  public int hashCode(Object obj) {
    return 0;
  }
}

class S14AnnoBoth implements Annotation {
  @Override
  public Class<? extends Annotation> annotationType() {
    return S14AnnoBoth.class;
  }

  @Override
  public boolean equals(Object other) {
    return false;
  }

  @Override
  public int hashCode() {
    return 0;
  }
}

class S14AnnoChild extends S14AnnoBoth {}

abstract class S14AnnoAbstract implements Annotation {}

interface S14AnnoInterface extends Annotation {}

enum S14AnnoEnum implements Annotation {
  VALUE_1,
  VALUE_2;

  @Override
  public Class<? extends Annotation> annotationType() {
    return S14AnnoEnum.class;
  }
}

@interface S14UserAnno {}

class S14AnnoAnonymous {
  Annotation get() {
    return new Annotation() {
      @Override
      public Class<? extends Annotation> annotationType() {
        return Annotation.class;
      }
    };
  }

  Annotation user() {
    return new S14UserAnno() {
      @Override
      public Class<? extends Annotation> annotationType() {
        return Annotation.class;
      }
    };
  }

  Annotation fine() {
    return new Annotation() {
      @Override
      public Class<? extends Annotation> annotationType() {
        return Annotation.class;
      }

      @Override
      public boolean equals(Object other) {
        return false;
      }

      @Override
      public int hashCode() {
        return 0;
      }
    };
  }

  @SuppressWarnings("BadAnnotationImplementation")
  static class Suppressed implements Annotation {
    @Override
    public Class<? extends Annotation> annotationType() {
      return Suppressed.class;
    }
  }

  static class Nested implements Annotation {
    @Override
    public Class<? extends Annotation> annotationType() {
      return Nested.class;
    }
  }
}

class S14Conditional {
  Object returnObject(boolean b) {
    return b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  Number returnNumber(boolean b) {
    return (b ? Integer.valueOf(0) : Long.valueOf(0));
  }

  Serializable returnSerializable(boolean b) {
    return b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void assignObject(boolean b, Object obj) {
    obj = b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void assignNumber(boolean b, Number obj) {
    obj = b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void variableObject(boolean b) {
    Object obj = b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void variableNumber(boolean b) {
    Number obj = b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void invokeMethod(boolean b, Number n) {
    invokeMethod(b, b ? Integer.valueOf(0) : Long.valueOf(0));
  }

  Long returnLong(boolean b) {
    return false ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void assignLong(boolean b, Long obj) {
    obj = b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void variableLong(boolean b) {
    Long obj = b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void variablePrimitive(boolean b) {
    long obj = b ? Integer.valueOf(0) : Long.valueOf(0);
  }

  void invokeLong(boolean b, Long n) {
    invokeLong(b, b ? Integer.valueOf(0) : Long.valueOf(0));
  }

  void sameTypes(boolean b) {
    Object o = b ? Integer.valueOf(0) : Integer.valueOf(1);
    Object p = b ? 1 : 2L;
    Object q = b ? Integer.valueOf(0) : 2L;
    Object r = b ? "a" : Integer.valueOf(1);
    Double d = b ? Double.valueOf(1) : Integer.valueOf(2);
    Comparable<?> c = b ? Integer.valueOf(0) : Long.valueOf(0);
    var v = b ? Integer.valueOf(0) : Long.valueOf(0);
    System.out.println(b ? Integer.valueOf(0) : Long.valueOf(0));
    String s = "x" + (b ? Integer.valueOf(0) : Long.valueOf(0));
  }

  @SuppressWarnings("ConditionalExpressionNumericPromotion")
  Object suppressed(boolean b) {
    return b ? Integer.valueOf(0) : Long.valueOf(0);
  }
}

class S14Dead {
  public void runtimeException() {
    new RuntimeException("Not thrown, and reference lost");
  }

  public void error() {
    new AssertionError("Not thrown, and reference lost");
  }

  public void fixIsToDeleteTheFirstStatement() {
    new IllegalArgumentException("why is this here?");
    int i = 1;
    System.out.println("i = " + i);

    if (true) {
      new RuntimeException("oops");
      System.out.println("another statement after exception");
    }

    switch (0) {
      default:
        new RuntimeException("oops");
        System.out.println("another statement after exception");
    }
  }

  public void firstStatementWithNoSurroundingBlock() {
    if (true)
      new InterruptedException("this should be thrown");

    if (true) return;
    else
      new ArithmeticException("should also be thrown");

    switch (4) {
      case 4:
        System.out.println("4");
        break;
      default:
        new IllegalArgumentException("should be thrown");
    }
  }

  public void arrowSwitch(int x) {
    switch (x) {
      case 1 -> System.out.println("one");
      case 2 -> {
        new RuntimeException("block");
        System.out.println();
      }
      default -> System.out.println();
    }
  }

  public void loops(boolean b) {
    while (b) new IllegalStateException();
    for (int i = 0; i < 2; i++) new IllegalStateException();
    new Object();
    new RuntimeException() {};
  }

  public void anonymous() {
    Runnable r = new Runnable() {
      public void run() {
        new RuntimeException("inside anonymous");
      }
    };
    Runnable l = () -> {
      new RuntimeException("inside lambda");
    };
  }

  {
    new Exception();
  }

  RuntimeException viaSwitch(int k) {
    return switch (k) {
      case 0 -> new IllegalStateException("a");
      default -> new IllegalArgumentException("b");
    };
  }

  @SuppressWarnings("DeadException")
  void suppressed() {
    new RuntimeException();
  }

  public void noError() {
    Exception e = new RuntimeException("stored");
    e = new UnsupportedOperationException("also stored");
    throw new IllegalArgumentException("thrown");
  }

  public Exception returnsException() {
    return new RuntimeException("returned");
  }

  void parenthesized() {
    (new RuntimeException()).toString();
  }
}

class S14DeadJunit3 extends junit.framework.TestCase {
  public void testShouldAllowTestingOfExceptionConstructorSideEffects() {
    try {
      new IllegalArgumentException((Throwable) null);
    } catch (NullPointerException e) {
    }
  }
}

class S14DeadJunit4 {
  @org.junit.Test
  public void shouldAllowTestingOfExceptionConstructorSideEffects() {
    try {
      new IllegalArgumentException((Throwable) null);
    } catch (NullPointerException e) {
    }
  }
}

abstract class S14DeadAbstract extends junit.framework.TestCase {
  public void helper() {
    new RuntimeException("abstract junit3 is not a junit3 test class");
  }
}

class S14DeadAmbiguous extends junit.framework.TestCase {
  @org.junit.Test
  public void ambiguous() {
    new RuntimeException("ambiguous");
  }
}

class S14DeadInner {
  static class Inner extends junit.framework.TestCase {
    public void testInner() {
      new RuntimeException("not top level");
    }
  }
}

@org.junit.runner.RunWith(org.junit.runners.JUnit4.class)
class S14DeadRunWith {
  void helper() {
    new RuntimeException("run with");
  }
}
