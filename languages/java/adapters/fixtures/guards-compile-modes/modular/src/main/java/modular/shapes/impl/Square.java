package modular.shapes.impl;

import modular.shapes.Shape;

public record Square(double side) implements Shape {
  @Override
  public double area() {
    return side * side;
  }
}
