package fluent;

import lombok.experimental.SuperBuilder;

@SuperBuilder
public class Child extends Base<String> {
  private final String title;
}
