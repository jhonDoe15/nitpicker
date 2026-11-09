package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

public class ShipmentNgTest {
  private final List<Long> shipped = new ArrayList<>();
  private List<Long> fresh;

  @BeforeMethod
  public void startEmpty() {
    fresh = new ArrayList<>();
  }

  @Test
  public void shipsOnce() {
    shipped.add(Prices.sum(List.of(1L, 2L))); // violation: SharedTestState
    fresh.add(3L);
    assertThat(fresh).containsExactly(3L);
  }
}
