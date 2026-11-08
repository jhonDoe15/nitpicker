package demo;

import java.util.List;

public class Allowed {
  public boolean empty(List<String> items) {
    return items.isEmpty();
  }

  public boolean present(String name) {
    return name != null && name.isBlank();
  }

  public boolean either(boolean first, boolean second) {
    return first || second;
  }

  public Object boxed(boolean first, String name) {
    return first ? true : name;
  }

  public boolean text(Object value) {
    return value instanceof String;
  }

  public int nested(int count, boolean ready) {
    if (count > 0 && ready) {
      return count;
    }
    return 0;
  }

  public int guarded(int count, boolean ready) {
    if (count > 0) {
      if (ready) {
        return count;
      }
      return -1;
    }
    return 0;
  }

  public boolean differs(int left, int right) {
    return left != right;
  }

  public boolean notBelow(double left, double right) {
    return !(left < right);
  }

  public String swapped(boolean ready) {
    if (ready) {
      return "go";
    } else {
      return "wait";
    }
  }

  public String compared(int left, int right) {
    if (left != right) {
      return "differs";
    } else {
      return "same";
    }
  }

  public String chained(boolean ready, boolean late) {
    if (!ready) {
      return "wait";
    } else if (late) {
      return "late";
    }
    return "go";
  }

  public boolean neither(boolean first, boolean second) {
    return !(first || second);
  }

  public boolean mixed(boolean first, boolean second) {
    return !first && second;
  }

  public boolean negatedChain(boolean first, boolean second, boolean third) {
    return !first && !second && third;
  }
}
