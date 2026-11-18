const MAIN = 'src/main/java/demo';

export const SAFE_CASES = [
  {
    check: 'UseStandardCharsets',
    file: `${MAIN}/Charsets.java`,
    before: `package demo;

import java.nio.charset.Charset;

public class Charsets {
  Charset utf8() {
    return Charset.forName("UTF-8");
  }
}
`,
    after: `package demo;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

public class Charsets {
  Charset utf8() {
    return StandardCharsets.UTF_8;
  }
}
`,
    lines: [7],
  },
  {
    check: 'SpringComposedMapping',
    file: `${MAIN}/Mapping.java`,
    before: `package demo;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class Mapping {
  @RequestMapping(value = "/items", method = RequestMethod.GET)
  public String items() {
    return "items";
  }
}
`,
    after: `package demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class Mapping {
  @GetMapping("/items")
  public String items() {
    return "items";
  }
}
`,
    lines: [9],
  },
  {
    check: 'SpringRestController',
    file: `${MAIN}/Rest.java`,
    before: `package demo;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

@Controller
@ResponseBody
public class Rest {
  @GetMapping("/ping")
  public String ping() {
    return "pong";
  }
}
`,
    after: `package demo;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class Rest {
  @GetMapping("/ping")
  public String ping() {
    return "pong";
  }
}
`,
    lines: [8],
  },
  {
    check: 'LogStringConcatenation',
    file: `${MAIN}/Logging.java`,
    before: `package demo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Logging {
  private static final Logger LOG = LoggerFactory.getLogger(Logging.class);

  void greet(String name) {
    LOG.info("hello " + name);
  }
}
`,
    after: `package demo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public class Logging {
  private static final Logger LOG = LoggerFactory.getLogger(Logging.class);

  void greet(String name) {
    LOG.info("hello {}", name);
  }
}
`,
    lines: [10],
  },
  {
    check: 'UseCollectionIsEmpty',
    file: `${MAIN}/Emptiness.java`,
    before: `package demo;

import java.util.List;

public class Emptiness {
  boolean none(List<String> names) {
    return names.size() == 0;
  }
}
`,
    after: `package demo;

import java.util.List;

public class Emptiness {
  boolean none(List<String> names) {
    return names.isEmpty();
  }
}
`,
    lines: [7],
  },
  {
    check: 'SimplifyBooleanReturns',
    file: `${MAIN}/Flags.java`,
    before: `package demo;

public class Flags {
  boolean positive(int count) {
    if (count > 0) {
      return true;
    }
    return false;
  }
}
`,
    after: `package demo;

public class Flags {
  boolean positive(int count) {
    return count > 0;
  }
}
`,
    lines: [5],
  },
  {
    check: 'SimplifiedTernary',
    file: `${MAIN}/Choice.java`,
    before: `package demo;

public class Choice {
  boolean either(boolean ready, boolean late) {
    return ready ? true : late;
  }
}
`,
    after: `package demo;

public class Choice {
  boolean either(boolean ready, boolean late) {
    return ready || late;
  }
}
`,
    lines: [5],
  },
  {
    check: 'SimplifyBooleanExpressions',
    file: `${MAIN}/Truth.java`,
    before: `package demo;

public class Truth {
  boolean same(boolean ready) {
    return ready == true;
  }
}
`,
    after: `package demo;

public class Truth {
  boolean same(boolean ready) {
    return ready;
  }
}
`,
    lines: [5],
  },
  {
    check: 'CollapsibleIfStatements',
    file: `${MAIN}/Nesting.java`,
    before: `package demo;

import java.util.List;

public class Nesting {
  void add(boolean first, boolean second, List<String> out) {
    if (first) {
      if (second) {
        out.add("both");
      }
    }
  }
}
`,
    after: `package demo;

import java.util.List;

public class Nesting {
  void add(boolean first, boolean second, List<String> out) {
    if (first && second) {
      out.add("both");
    }
  }
}
`,
    lines: [7],
  },
  {
    check: 'UselessStringValueOf',
    file: `${MAIN}/Texts.java`,
    before: `package demo;

public class Texts {
  String label(int count) {
    return "n=" + String.valueOf(count);
  }
}
`,
    after: `package demo;

public class Texts {
  String label(int count) {
    return "n=" + count;
  }
}
`,
    lines: [5],
  },
];
