package e;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

class B6Fields {
  private int simple;
  private int usedBefore;
  private int conditional;
  private int twoMethods;
  private int readBeforeAssign;
  private int onlyAssigned;
  private int unusedLeading;
  private int unused;
  private int usedInFieldInit;
  private int viaThis;
  private int depth;
  private String annotated;
  @Deprecated private String deprecatedAnnotated;
  @SuppressWarnings("x") private String suppressedWarning;
  private int lambdaUse;
  private int calledBetween;
  private int newBetween;
  private List<String> list;
  private int param;
  private int shadowedByParam;
  public int publicField;
  int packageField;
  private static int staticField;
  private final int finalField = 1;
  private int x, y;
  private int multiA = 0, multiB;
  private int dependsOnConstructor;
  private int usedInConstructor;
  private int inInitializer;
  private int innerClassUse;
  private int viaOtherObject;
  private int incremented;
  private int compound;
  private int loopAssign;
  private int ternary;
  private int tryAssign;
  private int blockAssign;
  private int assignInArgument;
  private int checkedAssign;
  private int shared;
  private int usedInOther;
  private int innerAssign;
  private int usedInStaticMethod;
  private int usedInSwitch;
  private int selfRef;
  private int nested;
  private int sameNameRhs;
  private int overwritten;

  int field2 = usedInFieldInit;

  B6Fields(int dependsOnConstructor) {
    this.dependsOnConstructor = dependsOnConstructor;
    usedInConstructor = 2;
    int q = usedInConstructor + 1;
  }

  {
    inInitializer = 5;
    int w = inInitializer;
  }

  void simple() {
    simple = compute();
    System.out.println(simple);
  }

  void usedBefore() {
    System.out.println(usedBefore);
    usedBefore = compute();
  }

  void conditional(boolean b) {
    if (b) {
      conditional = 1;
    }
    System.out.println(conditional);
  }

  void twoMethodsA() {
    twoMethods = compute();
    System.out.println(twoMethods);
  }

  void twoMethodsB() {
    twoMethods = compute();
    System.out.println(twoMethods + 1);
  }

  void readBeforeAssign() {
    int r = readBeforeAssign;
    readBeforeAssign = 1;
  }

  void onlyAssigned() {
    onlyAssigned = 5;
  }

  void viaThis() {
    this.viaThis = compute();
    System.out.println(this.viaThis);
    System.out.println(viaThis);
  }

  void depth() {
    depth = compute();
    foo(depth);
    foo(depth + depth);
  }

  void annotated() {
    annotated = "a";
    foo(annotated);
    deprecatedAnnotated = "b";
    foo(deprecatedAnnotated);
    suppressedWarning = "c";
    foo(suppressedWarning);
  }

  void lambdaUse() {
    lambdaUse = 3;
    Runnable r = () -> foo(lambdaUse);
  }

  void lambdaAssign() {
    Runnable r = () -> {
      lambdaUse = 4;
      foo(lambdaUse);
    };
  }

  void calledBetween() {
    calledBetween = 1;
    compute();
    foo(calledBetween);
  }

  void newBetween() {
    newBetween = 1;
    new Object();
    foo(newBetween);
  }

  void list() {
    list = new ArrayList<>();
    list.add("x");
  }

  void param(int param) {
    this.param = param;
    foo(this.param);
  }

  void shadow(int shadowedByParam) {
    this.shadowedByParam = shadowedByParam + 1;
    foo(this.shadowedByParam);
  }

  void multi() {
    x = 1;
    y = 2;
    foo(x + y);
  }

  void multi2() {
    multiA = 1;
    multiB = 2;
    foo(multiA);
    foo(multiB);
  }

  void viaOtherObject(B6Fields other) {
    viaOtherObject = 1;
    foo(other.viaOtherObject);
  }

  void incremented() {
    incremented = 1;
    incremented++;
  }

  void compound() {
    compound = 1;
    compound += 2;
    foo(compound);
  }

  void loop(int n) {
    for (int i = 0; i < n; i++) {
      loopAssign = i;
      foo(loopAssign);
    }
  }

  void ternary(boolean b) {
    ternary = b ? 1 : 2;
    foo(ternary);
  }

  void tryAssign() {
    try {
      tryAssign = compute();
      foo(tryAssign);
    } finally {
    }
  }

  void blockAssign() {
    {
      blockAssign = compute();
      foo(blockAssign);
    }
  }

  void assignInArgument() {
    foo(assignInArgument = 1);
    foo(assignInArgument);
  }

  void checkedAssign() {
    int a = checkedAssign = 3;
    foo(checkedAssign);
  }

  void sharedA() {
    shared = 1;
    foo(shared);
  }

  Runnable sharedB = new Runnable() {
    public void run() {
      foo(shared);
    }
  };

  void inner() {
    innerClassUse = 1;
    new Object() {
      void f() {
        foo(innerClassUse);
      }
    };
  }

  void innerAssign() {
    innerAssign = 1;
    foo(innerAssign);
    new Object() {
      void f() {
        innerAssign = 2;
      }
    };
  }

  static void staticUse(B6Fields f) {
    f.usedInOther = 2;
  }

  void usedInOther() {
    usedInOther = 1;
    foo(usedInOther);
  }

  void usedInSwitch(int k) {
    usedInSwitch = k;
    switch (usedInSwitch) {
      default:
        break;
    }
  }

  void selfRef() {
    selfRef = selfRef + 1;
    foo(selfRef);
  }

  void nested() {
    nested = compute();
    foo(nested);
    nested = compute();
    foo(nested);
  }

  void sameName(int sameNameRhs) {
    this.sameNameRhs = sameNameRhs;
    foo(this.sameNameRhs);
  }

  void sameNameLocal() {
    int sameNameRhs = 4;
    sameNameRhs = sameNameRhs;
    foo(sameNameRhs);
  }

  void overwritten() {
    overwritten = 1;
    foo(overwritten);
    overwritten = 2;
    foo(overwritten);
  }

  void unusedLeading() {
    unusedLeading = 1;
    foo(unusedLeading);
  }

  void unusedName() {
    unused = 1;
    foo(unused);
  }

  void dependsOnConstructor() {
    foo(dependsOnConstructor);
  }

  void usedInInitializerOnly() {
    foo(inInitializer);
  }

  void usedInConstructor() {
    foo(usedInConstructor);
  }

  void noModifiers() {
    packageField = 1;
    publicField = 2;
    staticField = 3;
    foo(packageField + publicField + staticField);
  }

  int compute() {
    return 1;
  }

  void foo(Object o) {}

  void foo(int i) {}

  static class Nested {
    private int nestedField;
    private int other;

    void f() {
      nestedField = 1;
      foo(nestedField);
    }

    void foo(int a) {}
  }

  class WithTab {
	private int tabbed;

	void f() {
		tabbed = 1;
		System.out.println(tabbed);
	}
  }

  @SuppressWarnings("FieldCanBeLocal")
  static class SuppressedClass {
    private int hidden;

    void f() {
      hidden = 1;
      System.out.println(hidden);
    }
  }

  static class SuppressedField {
    @SuppressWarnings("FieldCanBeLocal")
    private int hidden;

    void f() {
      hidden = 1;
      System.out.println(hidden);
    }
  }

  static class Generic<T> {
    private T value;
    private List<? extends T> items;
    private java.util.Map<String, List<T>> map;

    void f(T t) {
      value = t;
      System.out.println(value);
      items = null;
      System.out.println(items);
      map = null;
      System.out.println(map);
    }
  }

  static class Lambda {
    private int inLambda;
    private int lambdaAssignedOnly;
    private Supplier<Integer> sup;

    void f() {
      sup = () -> {
        inLambda = 3;
        return inLambda;
      };
    }

    void g() {
      Runnable r = () -> {
        lambdaAssignedOnly = 1;
        System.out.println(lambdaAssignedOnly);
      };
    }
  }

  static class Annots {
    @interface LocalOk {}

    @java.lang.annotation.Target(java.lang.annotation.ElementType.FIELD)
    @interface FieldOnly {}

    @java.lang.annotation.Target({java.lang.annotation.ElementType.FIELD, java.lang.annotation.ElementType.LOCAL_VARIABLE})
    @interface Both {}

    @LocalOk private int a;
    @FieldOnly private int b;
    @Both private int c;
    @LocalOk @Both private int d;
    @LocalOk @FieldOnly private int e;

    void f() {
      a = 1;
      b = 2;
      c = 3;
      d = 4;
      e = 5;
      System.out.println(a + b + c + d + e);
    }
  }

  static class Keep {
    @interface UsedReflectively {}

    @UsedReflectively
    private int kept;

    void f() {
      kept = 1;
      System.out.println(kept);
    }
  }
}
