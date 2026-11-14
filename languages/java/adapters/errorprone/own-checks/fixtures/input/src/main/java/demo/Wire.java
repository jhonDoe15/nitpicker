package demo;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;

public class Wire {
  @Autowired
  private Repo repo;

  @Autowired
  @Qualifier("main")
  Repo other;

  @Value("${name}")
  private String name;

  private int count;

  void run() {
    count++;
  }

  public static class Repo {}
}

class Single {
  private final Wire.Repo repo;

  @Autowired
  Single(Wire.Repo repo) {
    this.repo = repo;
  }
}
