package rare;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Enumeration;
import java.util.List;
import sun.misc.Signal;

@interface DoNotMutate {}

class Rare implements Enumeration<String> {
  private MessageDigest digest;
  private final List<Integer> numbers = new ArrayList<>();

  @DoNotMutate
  void finalizers(Object other) throws Throwable {
    other.toString();
    this.finalize();
    System.gc();
    Runtime.getRuntime().runFinalization();
  }

  BigDecimal decimals(double value) {
    return value > 0 ? new BigDecimal(0.1) : new BigDecimal(value);
  }

  int unary(int value, boolean flag) {
    int twice = - -value;
    boolean same = !!flag;
    return same ? twice : ~~value;
  }

  void losesFailure(Collection<String> names) {
    try {
      names.clear();
    } catch (IllegalStateException failure) {
      failure.getMessage();
      failure.getCause();
      failure.toString();
    }
    Integer[] boxed = (Integer[]) numbers.toArray();
    Object[] plain = (Object[]) numbers.toArray();
  }

  boolean nan(double value, float small) {
    return value == Double.NaN || small != Float.NaN || value < Double.NaN;
  }

  String card() {
    return "/sdcard/data" + "/other";
  }

  float loops() {
    float total = 0;
    for (float step = 0; step < 1; step += 0.1f) {
      total += step;
    }
    for (int index = 0; index < 3; index++) {
      total += index;
    }
    return total;
  }

  void Rare() {}

  int hashcode() {
    return 1;
  }

  int HashCode() {
    return 2;
  }

  boolean misplaced(String text, String other) {
    if (text.isEmpty() && text != null) {
      return true;
    }
    if (other.length() > 2 || other == null) {
      return false;
    }
    return text != null && text.isEmpty();
  }

  int labels(int value) {
    switch (value) {
      case 1:
        return 1;
      mylabel:
        return 2;
      default:
        return 3;
      case 4:
        return 4;
    }
  }

  @SuppressWarnings("finally")
  int finallyReturn() {
    try {
      return 1;
    } finally {
      Runnable later = () -> {
        return;
      };
      later.run();
      return 2;
    }
  }

  String buffers(char letter, StringBuffer buffer, int number) {
    StringBuilder built = new StringBuilder(letter);
    StringBuffer other = new StringBuffer('x');
    StringBuilder sized = new StringBuilder(16);
    if (true) {
      built.append(letter);
    }
    if (false) {
      other.append(letter);
    } else if (number > 2) {
      sized.append(number);
    }
    String one = new Integer(number).toString();
    String two = new Long(number).toString();
    final String empty = "";
    boolean none = buffer.toString().length() == 0 || buffer.toString().equals("") || buffer.toString().equals(empty);
    return one + two + none;
  }

  synchronized void wake() {
    notify();
    this.notify();
    notifyAll();
  }

  List<Integer> copies(Integer[] values) {
    List<Integer> copied = new ArrayList<>(values.length);
    for (int i = 0; i < values.length; i++) {
      copied.add(values[i]);
    }
    return copied;
  }

  @Override
  public boolean hasMoreElements() {
    return false;
  }

  @Override
  public String nextElement() {
    return Signal.class.getName();
  }
}

class Finalizers {
  static class Empty {
    @Override
    protected void finalize() {}
  }

  static class OnlySuper {
    @Override
    protected void finalize() throws Throwable {
      super.finalize();
    }
  }

  static class NoSuper {
    private int count;

    @Override
    public void finalize() {
      count++;
    }

    void finalize(int times) {
      count += times;
    }
  }

  static class Proper {
    private int count;

    @Override
    protected void finalize() throws Throwable {
      try {
        count++;
      } finally {
        super.finalize();
      }
    }
  }
}
