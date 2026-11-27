package rapi.use;

import java.util.function.BiFunction;
import rapi.Allow;
import rapi.Point;

class Points {
  Point plain() {
    return new Point(3, 4);
  }

  @Allow
  Point allowed() {
    return new Point(5, 6);
  }

  BiFunction<Integer, Integer, Point> made() {
    return Point::new;
  }
}
