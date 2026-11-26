package e;

import java.io.FilterWriter;
import java.io.StringWriter;
import java.io.Writer;

public class S17Cast {
  static class Super {}

  static class Sub extends Super {}

  static class Disjoint {}

  interface Marker {}

  static final class FinalClass {}

  static class Open {}

  static String testCall() {
    return "";
  }

  static void positives(Object foo2, Object foo3) {
    if (foo2 instanceof Super) {
      String str = ((String) foo2).toString();
    }
    if (foo2 instanceof String) {
      double val = ((Integer) foo2).doubleValue();
    }
    if (foo2 instanceof String && 7 == 7) {
      double val = ((Integer) foo2).doubleValue();
    }
    if (7 == 7 && foo2 instanceof String) {
      double val = ((Integer) foo2).doubleValue();
    }
    if (7 == 7 && foo2 instanceof String && 8 == 8) {
      double val = ((Integer) foo2).doubleValue();
    }
    if (foo2 instanceof String) {
      String str = ((Integer) foo2).toString();
    } else {
      String str = "";
    }
    if (foo2 instanceof String) {
      String str = ((Integer) foo3).toString();
      String str2 = ((Integer) foo2).toString();
    } else {
      String str = ((Integer) foo3).toString();
      String str2 = "";
    }
    if (7 == 7 && (foo2 instanceof Super) && (((String) foo2).equals(""))) {
      String str = "";
    }
    if (7 == 7 && foo3 instanceof String && foo2 instanceof String) {
      String str = ((Integer) foo2).toString();
    }
    if (foo2 instanceof String) {
      if (7 == 7) {
        String str = ((Integer) foo2).toString();
      }
    }
    if (foo2 instanceof String) {
      if (7 == 7) {
        String str = "";
      } else {
        String str = ((Integer) foo2).toString();
      }
    }
    String foo1;
    if (foo2 instanceof Super) {
      foo1 = "";
      String str = ((Integer) foo2).toString();
    }
    if (foo2 instanceof Super) {
      String str = ((Integer) foo2).toString();
      foo2 = "";
    }
    if (foo2 instanceof String) {
      S17Cast other = (S17Cast) foo2;
    }
    if (foo2 instanceof String) {
      String str = (String) foo2;
    } else if (foo2 instanceof String) {
      Integer i = (Integer) foo2;
    } else {
      foo2 = (Super) foo2;
    }
  }

  static void negatives(Object objSubClass, String foo, Object foo3) {
    if (!(objSubClass instanceof Super)) {
      Disjoint str = (Disjoint) objSubClass;
    }
    if (foo instanceof String) {
      ((String) foo).charAt(0);
    }
    if (testCall() instanceof String) {
      String bar = (String) testCall();
    }
    if (foo instanceof String) {
      Object bar = ((Object) foo).toString();
    }
    Sub subClass = new Sub();
    if (subClass instanceof Sub) {
      String str = ((Super) subClass).toString();
    }
    if (foo instanceof Object) {
      String bar = ((String) foo).toString();
    }
    if (testCall() instanceof Object) {
      String str = "";
    } else {
      String bar = ((String) testCall()).toString();
    }
    if (subClass instanceof Super) {
      if (7 == 7) {
        String bar = ((Super) subClass).toString();
      } else {
        String str = "";
      }
    }
    if (objSubClass instanceof Super) {
      if (objSubClass instanceof Disjoint) {
        Disjoint disClass = (Disjoint) objSubClass;
      }
    }
    Integer datatype = 0;
    if (objSubClass instanceof Super) {
      String str = "";
    } else {
      switch (datatype) {
        case 0:
          Disjoint str = (Disjoint) objSubClass;
          break;
        default:
          break;
      }
    }
    if (foo3 instanceof Super && ((Super) foo3).toString().equals("")) {
      String str = foo3.toString();
    }
    if (foo3 instanceof String || 7 == 7) {
      String str = ((Disjoint) foo3).toString();
    }
    if (foo3 instanceof String) {
      String str = "";
    } else {
      String str = ((Disjoint) foo3).toString();
    }
    if (7 == 7 && (foo3 instanceof Disjoint) && (!((Disjoint) foo3).equals(""))) {
      String str = "";
    }
    if (foo3 instanceof Super) {
      foo3 = "";
      String str = ((Integer) foo3).toString();
    }
    if (foo3 instanceof Marker) {
      Open open = (Open) foo3;
      FinalClass finalClass = (FinalClass) foo3;
    }
  }

  static void innerClassDecl(Object[] list) {
    for (Object c : list) {
      if (c instanceof String) {
        try {
          Writer fw =
              new FilterWriter(new StringWriter()) {
                public void write(int c) {
                  char a = (char) c;
                }
              };
        } finally {
        }
      }
    }
  }

  static void arrays(Object[] values, Object[] others, int index, Object o) {
    if (values[0] instanceof String) {
      Integer a = (Integer) values[0];
      Integer b = (Integer) values[1];
      Integer c = (Integer) others[0];
    }
    if (values[index] instanceof String) {
      Integer a = (Integer) values[index];
      Integer b = (Integer) values[0];
    }
  }

  static void literals(Object[] values, Object o) {
    if (values[0] instanceof String) {
      Integer a = (Integer) values[0x0];
      Integer b = (Integer) values[0L > 1 ? 0 : 1];
    }
    if (values[1] instanceof String) {
      Integer a = (Integer) values[1];
    }
  }

  static void patterns(Object o, Object p) {
    if (o instanceof String s) {
      Integer a = (Integer) o;
    }
    if (o instanceof String s && s.isEmpty()) {
      Integer a = (Integer) o;
    }
    if (o instanceof final String s) {
      Integer a = (Integer) o;
    }
    if (p instanceof Pair(String x, int y)) {
      Integer a = (Integer) p;
    }
    if (p instanceof Pair pair) {
      Integer a = (Integer) p;
    }
  }

  record Pair(String first, int second) {}

  static void parentheses(Object o) {
    if ((o instanceof String)) {
      Integer a = (Integer) o;
    }
    if ((o) instanceof String) {
      Integer a = (Integer) o;
    }
    if (o instanceof String) {
      Integer a = (Integer) (o);
    }
  }

  Object field;
  static Object staticField;

  void fields(Object parameter) {
    if (field instanceof String) {
      Integer a = (Integer) field;
    }
    if (this.field instanceof String) {
      Integer a = (Integer) this.field;
    }
    if (staticField instanceof String) {
      Integer a = (Integer) staticField;
    }
    if (parameter instanceof String) {
      Runnable r = () -> {
        Integer a = (Integer) parameter;
      };
      Object anonymous = new Object() {
        Integer b = (Integer) parameter;
      };
    }
  }

  @SuppressWarnings("InstanceOfAndCastMatchWrongType")
  void suppressed(Object o) {
    if (o instanceof String) {
      Integer a = (Integer) o;
    }
  }

  void shadowing(Object o) {
    if (o instanceof String) {
      Runnable r = new Runnable() {
        public void run() {
          Object o = new Object();
          Integer a = (Integer) o;
        }
      };
    }
    if (o instanceof String) {
      java.util.function.Function<Object, Integer> f = x -> (Integer) x;
    }
  }
}
