package e;

import java.util.concurrent.Callable;

class S14Functional {
  @FunctionalInterface
  interface SuperFI {
    void superSam();
  }

  @FunctionalInterface
  interface OtherSuperFI {
    void otherSuperSam();
  }

  @FunctionalInterface
  interface SubFI extends SuperFI {
    void subSam();

    @Override
    default void superSam() {
      subSam();
      System.out.println("do something else");
    }
  }

  @FunctionalInterface
  interface MultipleInheritanceSubFIOneBad extends SuperFI, OtherSuperFI {
    void subSam();

    @Override
    default void superSam() {
      subSam();
    }

    @Override
    default void otherSuperSam() {
      subSam();
      System.out.println("do something else");
    }
  }

  @FunctionalInterface
  interface MultipleInheritanceSubFIBothBad extends SuperFI, OtherSuperFI {
    void subSam();

    @Override
    default void superSam() {
      superSam();
      System.out.println("do something else");
    }

    @Override
    default void otherSuperSam() {
      subSam();
      System.out.println("do something else");
    }
  }

  @FunctionalInterface
  interface ValueReturningSuperFI {
    String superSam();
  }

  @FunctionalInterface
  interface ValueReturningSubFI extends ValueReturningSuperFI {
    String subSam();

    @Override
    default String superSam() {
      System.out.println("do something else");
      return subSam();
    }
  }

  @FunctionalInterface
  public interface ValueReturningSubFI2 extends ValueReturningSuperFI {
    String subSam();

    @Override
    default String superSam() {
      subSam();
      return null;
    }
  }

  @FunctionalInterface
  interface VoidSuperFI {
    Void superSam();
  }

  @FunctionalInterface
  interface VoidSubFI extends VoidSuperFI {
    Void subSam();

    @Override
    default Void superSam() {
      subSam();
      return null;
    }
  }

  @FunctionalInterface
  interface VoidSubFIBad extends VoidSuperFI {
    Void subSam();

    @Override
    default Void superSam() {
      subSam();
      subSam();
      return null;
    }
  }

  @FunctionalInterface
  interface VoidSubFIOther extends VoidSuperFI {
    Void subSam();

    @Override
    default Void superSam() {
      subSam();
      return this.subSam();
    }
  }

  @FunctionalInterface
  interface ReturnsSam extends ValueReturningSuperFI {
    String subSam();

    @Override
    default String superSam() {
      return subSam();
    }
  }

  @FunctionalInterface
  interface NotOverriding extends SuperFI {
    void subSam();

    default void extra() {
      subSam();
      System.out.println();
    }

    @Override
    default void superSam() {
      this.subSam();
    }
  }

  interface NotFunctional extends SuperFI {
    void subSam();

    @Override
    default void superSam() {
      subSam();
      System.out.println("do something else");
    }
  }

  @FunctionalInterface
  interface PlainSuper extends Callable<String> {
    String subSam();

    @Override
    default String call() {
      System.out.println();
      return subSam();
    }
  }

  @FunctionalInterface
  interface Suppressed extends SuperFI {
    void subSam();

    @Override
    @SuppressWarnings("FunctionalInterfaceMethodChanged")
    default void superSam() {
      subSam();
      System.out.println("do something else");
    }
  }
}
