package sales;

import java.util.List;

public class Polygon implements Shape {
  private ShapeId id;
  private List<Vertex> vertices;

  @Override
  public ShapeId getId() {
    return id;
  }
}
