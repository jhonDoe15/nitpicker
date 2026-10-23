package sales;

import org.jmolecules.ddd.types.AggregateRoot;
import org.jmolecules.ddd.types.Identifier;

public interface Shape extends AggregateRoot<Shape, Shape.ShapeId> {
  record ShapeId(long value) implements Identifier {}
}
