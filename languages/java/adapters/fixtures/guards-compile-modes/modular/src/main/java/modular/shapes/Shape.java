package modular.shapes;

import java.util.List;
import modular.shapes.impl.Circle;
import modular.shapes.impl.Square;

public sealed interface Shape permits Circle, Square {
  double area();

  static List corners() {
    return List.of();
  }
}
