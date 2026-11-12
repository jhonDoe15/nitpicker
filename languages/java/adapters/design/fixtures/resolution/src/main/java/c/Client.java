package c;

import static a.Util.twice;

import a.*;
import b.*;
import java.util.ArrayList;
import java.util.List;

public class Client {
  private final Circle circle = new Circle(2);
  private final List<Shape> shapes = new ArrayList<>();

  public int ambiguousImport() {
    return Util.plain();
  }

  public int staticImported() {
    return twice(4);
  }

  public int overloadedSameArity() {
    return a.Util.pick(1);
  }

  public String viaField() {
    shapes.add(circle);
    return this.circle.hello();
  }

  public double viaVar() {
    var made = new Circle();
    Shape shape = made.grow();
    return shape.area();
  }

  public double viaCast(Object value) {
    return ((Circle) value).area();
  }

  public <Shape> double shadowed(Shape shape) {
    return shape.hashCode();
  }

  public double viaInnerLoop(List<Circle> circles) {
    double sum = 0;
    for (Circle each : circles) {
      sum += each.area();
    }
    return sum;
  }

  public int nested() {
    return Outer.Inner.make().value();
  }
}
