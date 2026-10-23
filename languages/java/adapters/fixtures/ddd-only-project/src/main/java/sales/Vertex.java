package sales;

import org.jmolecules.ddd.types.Entity;
import org.jmolecules.ddd.types.Identifier;

public class Vertex implements Entity<Shape, Vertex.VertexId> {
  private VertexId id;
  private Polygon polygon;

  @Override
  public VertexId getId() {
    return id;
  }

  public record VertexId(long value) implements Identifier {}
}
