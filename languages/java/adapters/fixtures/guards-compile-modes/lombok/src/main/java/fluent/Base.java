package fluent;

import lombok.experimental.SuperBuilder;

@SuperBuilder
public class Base<I> {
  private final I id;
}
