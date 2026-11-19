package shop.slips;

import java.util.List;
import java.util.Map;
import org.springframework.util.Assert;

public final class Checks {
  private final String name;
  private final List<String> tags;

  public Checks(String name, List<String> tags, int pages, String credentials) {
    Assert.notNull(pages >= 0, "pages must not be null."); // violation: AssertNotNullWrongCheck
    Assert.notNull(!"".equals(credentials), "credentials are required"); // violation: AssertNotNullWrongCheck
    Assert.notNull(pages, "pages must not be null"); // violation: AssertNotNullWrongCheck
    Assert.notNull(name, "name must not be null");
    Assert.notNull(name, "name must not be empty"); // violation: AssertNotNullWrongCheck
    Assert.notNull(tags, "tags must not be blank"); // violation: AssertNotNullWrongCheck
    Assert.isTrue(pages >= 0, "pages must not be negative");
    Assert.hasText(credentials, "credentials must not be empty");
    Assert.notEmpty(tags, "tags must not be empty");
    this.name = name;
    this.tags = tags;
  }

  public void rename(Map<String, Boolean> flags, Integer count, Object payload) {
    Boolean strict = flags.get("strict");
    Assert.notNull(strict, "strict must not be null");
    Assert.notNull(count, "count must not be null");
    Assert.notNull(payload, "payload must not be null");
    Assert.notNull(name, "name must not be null");
    Assert.notNull(tags, "tags must not be null");
  }
}
