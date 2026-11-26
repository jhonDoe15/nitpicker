package e;

import java.util.function.BooleanSupplier;

class B8Interrupt {
  void statement() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      Thread.interrupted();
    }
  }

  void valueUsed() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      boolean was = Thread.interrupted();
      if (Thread.interrupted()) {
        return;
      }
    }
  }

  void notInterrupted() throws InterruptedException {
    try {
      Thread.sleep(1);
    } catch (RuntimeException e) {
      Thread.interrupted();
    }
  }

  void unionCase() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException | IllegalStateException e) {
      Thread.interrupted();
    }
  }

  void subclassOfInterrupted() {
    try {
      risky();
    } catch (MyInterrupted e) {
      Thread.interrupted();
    }
  }

  void lambdaInside() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      Runnable r = () -> Thread.interrupted();
      BooleanSupplier s = () -> Thread.interrupted();
      Runnable block = () -> {
        Thread.interrupted();
      };
    }
  }

  void nestedCatches() throws InterruptedException {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      try {
        Thread.sleep(2);
      } catch (InterruptedException inner) {
        Thread.interrupted();
      }
    }
  }

  void currentThread() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      Thread.currentThread().isInterrupted();
      Thread.currentThread().interrupt();
    }
  }

  void instanceCall(Thread t) {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      t.isInterrupted();
    }
  }

  void outsideCatch() {
    Thread.interrupted();
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
    } finally {
      Thread.interrupted();
    }
  }

  @SuppressWarnings("InterruptedInCatchBlock")
  void suppressed() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      Thread.interrupted();
    }
  }

  void suppressedInner() {
    try {
      Thread.sleep(1);
    } catch (InterruptedException e) {
      @SuppressWarnings("InterruptedInCatchBlock")
      boolean b = Thread.interrupted();
    }
  }

  static class MyInterrupted extends InterruptedException {}

  static class MyThread extends Thread {
    void sub() {
      try {
        Thread.sleep(1);
      } catch (InterruptedException e) {
        MyThread.interrupted();
        interrupted();
      }
    }
  }

  static void risky() throws MyInterrupted {}
}
