package a;

public interface Shape {
  double area();

  default String describe() {
    return "shape" + area();
  }
}
