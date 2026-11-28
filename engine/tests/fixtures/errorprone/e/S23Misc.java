package e;

import com.google.common.collect.ImmutableList;
import com.google.common.testing.NullPointerTester;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

class S23Misc {
  static int counter;
  static int[] arrays = new int[1];
  int instanceField;
  final Object lock = new Object();
  static final Object STATIC_LOCK = new Object();

  void guarded() {
    synchronized (lock) {
      counter++;
      counter = 1;
      counter += 2;
      --counter;
      S23Misc.counter = 3;
      this.instanceField = 2;
      arrays[0] = 1;
      new Object() {
        void inside() {
          counter = 5;
        }
      };
      Runnable r = () -> counter++;
      synchronized (this) {
        counter = 7;
      }
    }
    synchronized (this) {
      counter = 4;
    }
    synchronized (S23Misc.class) {
      counter = 5;
    }
    synchronized (STATIC_LOCK) {
      counter = 6;
    }
    synchronized (this.lock) {
      S23Misc.counter++;
      instanceField++;
    }
    Object local = new Object();
    synchronized (local) {
      counter = 8;
    }
    synchronized (local) {
      int x = 1;
      x++;
    }
    synchronized ((lock)) {
      counter = 9;
    }
  }

  @SuppressWarnings("StaticGuardedByInstance")
  void suppressed() {
    synchronized (lock) {
      counter = 1;
    }
  }

  void setDefaults(NullPointerTester tester) {
    tester.setDefault(String.class, "");
    tester.setDefault(Object.class, "");
    tester.setDefault(Locale.class, Locale.US);
    tester.setDefault(List.class, ImmutableList.of());
    tester.setDefault(Pattern.class, Pattern.compile(""));
    tester.setDefault(BigDecimal.class, BigDecimal.ZERO);
    tester.setDefault(Number.class, 0);
    tester.setDefault(CharSequence.class, "");
    NullPointerTester chained = tester.setDefault(String.class, "").setDefault(Number.class, 0);
    tester.setDefault(String.class, "x");
    tester.setDefault(String.class, " ");
    tester.setDefault(Number.class, 1);
    tester.setDefault(List.class, new ArrayList<>());
    tester.setDefault(Integer.class, 0);
    tester.setDefault(int.class, 0);
    tester.setDefault(Locale.class, Locale.FRANCE);
  }

  @SuppressWarnings("UnnecessarySetDefault")
  void suppressedSetDefault(NullPointerTester tester) {
    tester.setDefault(String.class, "");
  }

  void listRemove(List<Integer> list, List<Number> numbers, List<String> strings, List raw, List<? extends Integer> wild) {
    int i = 1;
    Integer boxed = 2;
    short s = 1;
    list.remove(i);
    list.remove(boxed);
    list.remove(0);
    list.remove(list.size() - 1);
    list.remove((list.size()) - (1));
    list.remove(1 + 1);
    list.remove(/* index= */ i);
    list.remove(/* index */ i);
    list.remove(/* element */ boxed);
    list.remove(/* element */ i);
    list.remove(Integer.valueOf(i));
    list.remove(boxed.intValue());
    list.remove((Integer) 3);
    list.remove((Object) 3);
    list.remove(s);
    numbers.remove(i);
    numbers.remove(boxed);
    numbers.remove(0);
    strings.remove(i);
    strings.remove(boxed);
    raw.remove(i);
    wild.remove(i);
    ImmutableListHolder.list.remove(0);
    this.list2.remove(this.list2.size() - 1);
    list2.remove(list2.size() - 1);
    list.remove(list2.size() - 1);
    getList().remove(getList().size() - 1);
    getList().remove(0);
    list.remove(i /* trailing */);
    list.remove(final1);
  }

  static final int final1 = 5;
  List<Integer> list2 = new ArrayList<>();

  List<Integer> getList() {
    return list2;
  }

  static class ImmutableListHolder {
    static List<Integer> list = new ArrayList<>();
  }

  static class ListSub extends ArrayList<Integer> {
    void test() {
      remove(1);
      remove(size() - 1);
      remove(0);
    }
  }

  @SuppressWarnings("ListRemoveAmbiguous")
  void suppressedRemove(List<Integer> list) {
    list.remove(1);
  }
}
