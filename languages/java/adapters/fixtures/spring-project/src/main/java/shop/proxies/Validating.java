package shop.proxies;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class Validating {
  public record Order(@NotBlank String sku) {}

  public void place(Order order, List<String> codes) {
    check(order); // violation: SpringProxySelfCall
    quantity(2); // violation: SpringProxySelfCall
    name(); // violation: SpringProxySelfCall
    codes(codes); // violation: SpringProxySelfCall
    region("EUR"); // violation: SpringProxySelfCall
    plain("x");
  }

  public void check(@Valid Order order) {}

  public void quantity(@Positive int count) {}

  @NotBlank
  public String name() {
    return "name";
  }

  public void codes(List<@NotBlank String> codes) {}

  public void region(@Traced.Code String code) {}

  public void plain(String text) {}

  void hidden(@NotNull String text) {} // violation: SpringProxyMethodVisibility

  private String described(String text) {
    return text;
  }

  public String describe(String text) {
    return described(text);
  }

  @NotBlank
  public String getLabel() {
    return "label";
  }

  public String label() {
    return getLabel();
  }

  private static String trimmed(@NotNull String text) {
    return text.trim();
  }

  public String trim(String text) {
    return trimmed(text)
        + new Object() {
          String name() {
            return "inner";
          }

          @Override
          public String toString() {
            name();
            return "anonymous";
          }
        };
  }
}
