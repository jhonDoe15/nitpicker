package e;

import java.util.ArrayList;

public class T2CollectionsBounds {
  static class Box<T extends Number> extends ArrayList<T> {}

  static class Named<T extends CharSequence> extends ArrayList<T> {}

  static boolean intersections(Box<? extends Runnable> box, Box<? extends Comparable<?>> other, Named<? extends Number> named) {
    return box.contains(1) || box.contains("s") || other.contains("s") || other.contains(2L) || named.contains("t");
  }
}
