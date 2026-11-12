package modular.shapes;

import org.apache.commons.lang3.StringUtils;

public final class Labels {
  private Labels() {}

  public static String label(Shape shape) {
    return StringUtils.capitalize(shape.getClass().getSimpleName());
  }
}
