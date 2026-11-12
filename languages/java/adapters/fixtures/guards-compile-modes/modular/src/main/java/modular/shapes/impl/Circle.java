package modular.shapes.impl;

import modular.shapes.Shape;

public record Circle(double radius) implements Shape {
  @Override
  public double area() {
    return Math.PI * radius * radius;
  }
}
