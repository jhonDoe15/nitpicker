package guards;

import java.util.List;
import java.util.Optional;
import org.apache.commons.lang3.StringUtils;

public final class Optionals {
  private final Optional<String> label = Optional.empty(); // violation: pmd/OptionalAsFieldOrParameter
  private final String plain = "plain";

  public String name(Optional<String> value) { // violation: pmd/OptionalAsFieldOrParameter
    return value.get(); // violation: pmd/OptionalGet
  }

  public String name(String value) {
    return StringUtils.isBlank(value) ? plain : value;
  }

  public Optional<List<String>> tags() { // violation: pmd/OptionalOfCollection
    return Optional.empty();
  }

  public Optional<byte[]> payload() {
    return label.map(String::getBytes);
  }

  public List<String> names() {
    return List.of(plain);
  }
}
