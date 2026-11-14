const MAIN = 'src/main/java/demo';
const TEST = 'src/test/java/demo';

export const REVIEW_CASES = [
  {
    check: 'LiteralsFirstInComparisons',
    file: `${MAIN}/Literals.java`,
    before: `package demo;

public class Literals {
  boolean admin(String role) {
    return role.equals("admin");
  }
}
`,
    after: `package demo;

public class Literals {
  boolean admin(String role) {
    return "admin".equals(role);
  }
}
`,
    lines: [5],
  },
  {
    check: 'PreserveStackTrace',
    file: `${MAIN}/Rethrow.java`,
    before: `package demo;

public class Rethrow {
  int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      throw new IllegalStateException("not a number");
    }
  }
}
`,
    after: `package demo;

public class Rethrow {
  int parse(String text) {
    try {
      return Integer.parseInt(text);
    } catch (NumberFormatException e) {
      throw new IllegalStateException("not a number", e);
    }
  }
}
`,
    lines: [8],
  },
  {
    check: 'SpringConstructorInjection',
    file: `${MAIN}/Injection.java`,
    before: `package demo;

import java.time.Clock;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

@Component
public class Injection {
  @Autowired
  private Clock clock;

  long now() {
    return clock.millis();
  }
}
`,
    after: `package demo;

import java.time.Clock;
import org.springframework.stereotype.Component;

@Component
public class Injection {
  private final Clock clock;

  public Injection(Clock clock) {
    this.clock = clock;
  }

  long now() {
    return clock.millis();
  }
}
`,
    lines: [10],
  },
  {
    check: 'MutationIgnoreMarker',
    file: `${MAIN}/Marked.java`,
    before: `package demo;

public class Marked {
  @DoNotMutate
  int one() {
    return 1;
  }
}
`,
    after: `package demo;

public class Marked {
  int one() {
    return 1;
  }
}
`,
    lines: [4],
  },
  {
    check: 'GeneratedOnHandWrittenCode',
    file: `${MAIN}/Handwritten.java`,
    before: `package demo;

import java.util.List;
import javax.annotation.processing.Generated;

@Generated("by hand")
public class Handwritten {
  List<String> none() {
    return List.of();
  }
}
`,
    after: `package demo;

import java.util.List;

public class Handwritten {
  List<String> none() {
    return List.of();
  }
}
`,
    lines: [6],
  },
  {
    check: 'DetachedTestCase',
    file: `${TEST}/DetachedTest.java`,
    before: `package demo;

import org.junit.jupiter.api.Test;

class DetachedTest {
  @Test
  void runs() {}

  public void forgotten() {}
}
`,
    after: `package demo;

import org.junit.jupiter.api.Test;

class DetachedTest {
  @Test
  void runs() {}

  @Test
  public void forgotten() {}
}
`,
    lines: [9],
  },
  {
    check: 'RetryInTest',
    file: `${TEST}/RetryTest.java`,
    before: `package demo;

import org.junit.jupiter.api.Test;
import org.junitpioneer.jupiter.RetryingTest;

class RetryTest {
  @Test
  void steady() {}

  @RetryingTest(3)
  void flaky() {}
}
`,
    after: `package demo;

import org.junit.jupiter.api.Test;

class RetryTest {
  @Test
  void steady() {}

  @Test
  void flaky() {}
}
`,
    lines: [10],
  },
];
