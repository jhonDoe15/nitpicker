package demo;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;

public class Wire {
  private final Repo repo;

  final Repo other;

  private final String name;

  private int count;

  public Wire(Repo repo, @Qualifier("main") Repo other, @Value("${name}") String name) {
    this.repo = repo;
    this.other = other;
    this.name = name;
  }

  void run() {
    count++;
  }

  public static class Repo {}
}

class Single {
  private final Wire.Repo repo;

  Single(Wire.Repo repo) {
    this.repo = repo;
  }
}
