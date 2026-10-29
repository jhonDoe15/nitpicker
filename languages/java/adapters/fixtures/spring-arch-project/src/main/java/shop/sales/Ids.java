package shop.sales;

import org.jmolecules.ddd.types.Identifier;

public final class Ids {
  private Ids() {}

  public record OrderId(long value) implements Identifier {}

  public record CustomerId(long value) implements Identifier {}

  public record CartId(long value) implements Identifier {}

  public record ProductId(long value) implements Identifier {}

  public record LineId(long value) implements Identifier {}
}
