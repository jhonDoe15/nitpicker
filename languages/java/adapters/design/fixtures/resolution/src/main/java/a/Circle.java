package a;

public class Circle extends Base implements Shape {
  private final double radius;

  public Circle(double radius) {
    super("circle");
    this.radius = radius;
  }

  public Circle() {
    this(1.0);
  }

  @Override
  public double area() {
    return radius * radius * 3;
  }

  @Override
  public String hello() {
    return super.hello() + describe();
  }

  public Circle grow() {
    return new Circle(radius + 1);
  }
}
