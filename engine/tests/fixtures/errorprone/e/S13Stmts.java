package e;

import com.google.common.collect.Lists;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;

class S13Stmts {
  static ArrayList<Callable<Void>> callables = new ArrayList<>();

  static Void register(Callable<Void> callable) {
    callables.add(callable);
    return null;
  }

  void throwNull() throws InterruptedException {
    throw null;
  }

  void throwNullParens() throws InterruptedException {
    throw (null);
  }

  void throwNew() {
    throw new NullPointerException();
  }

  @SuppressWarnings("ThrowNull")
  void throwNullSuppressed() throws InterruptedException {
    throw null;
  }

  void anonymous() throws Exception {
    new Object();
    new Object().toString();
    new Thread() {
      public void run() {}
    };
    new Thread("name") {
      public void run() {}
    };
    new Callable<Void>() {
      public Void call() throws Exception {
        return null;
      }
    };
    new Callable<Void>() {
      public Void call() throws Exception {
        return null;
      }
    }.call();
    new Callable<Void>() {
      {
        callables.add(this);
      }

      public Void call() throws Exception {
        return null;
      }
    };
    new Callable<Void>() {
      Void field;

      public Void call() throws Exception {
        return null;
      }
    };
    new Callable<Void>() {
      Void field = register(this);

      public Void call() throws Exception {
        return null;
      }
    };
    new Callable<Void>() {
      static {
        callables.clear();
      }

      public Void call() throws Exception {
        return null;
      }
    };
    new Runnable() {
      public void run() {}
    };
    Object used =
        new Runnable() {
          public void run() {}
        };
    new ArrayList<String>() {
      void helper() {}
    };
    new Comparable<String>() {
      public int compareTo(String other) {
        return 0;
      }
    };
  }

  @SuppressWarnings("UnusedAnonymousClass")
  void anonymousSuppressed() {
    new Runnable() {
      public void run() {}
    };
  }

  Runnable switched(int selector) {
    switch (selector) {
      case 0 -> new Runnable() {
        public void run() {}
      };
      default -> {}
    }
    return switch (selector) {
      case 0 -> new Runnable() {
        public void run() {}
      };
      default -> null;
    };
  }

  void modified(List<String> myList) {
    Collections.copy(new ArrayList<>(myList), null);
    Collections.fill(new ArrayList<>(myList), null);
    Collections.reverse(new ArrayList<>(myList));
    Collections.rotate(new ArrayList<>(myList), 5);
    Collections.shuffle(new ArrayList<>(myList));
    Collections.shuffle(new ArrayList<>(myList), null);
    Collections.sort(new ArrayList<>(myList));
    Collections.sort(new ArrayList<>(myList), null);
    Collections.swap(new ArrayList<>(myList), 1, 2);
    Collections.sort(Lists.newArrayList(myList));
    Collections.sort(Lists.newArrayList(myList), null);
    Collections.sort(Lists.newLinkedList(myList));
    Collections.sort(Lists.newLinkedList(myList), null);
    Collections.sort(myList);
    Collections.sort((new ArrayList<String>()));
    Collections.unmodifiableList(new ArrayList<>(myList));
    Collections.emptyList();
  }

  @SuppressWarnings("UnusedCollectionModifiedInPlace")
  void modifiedSuppressed(List<String> myList) {
    Collections.sort(new ArrayList<>(myList));
  }
}
