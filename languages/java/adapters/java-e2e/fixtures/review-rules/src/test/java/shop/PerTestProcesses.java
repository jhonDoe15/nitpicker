package shop;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

abstract class ProcessPerTestCases {
  private Process watcher;

  @BeforeEach
  void startWatcher() throws IOException {
    watcher = Runtime.getRuntime().exec(new String[] {"git", "status"}); // violation: ServerOrContainerPerTest
  }

  @Test
  void initializesTheFirstRepository() throws IOException, InterruptedException {
    Process git = new ProcessBuilder("git", "init").start(); // violation: ServerOrContainerPerTest
    assertThat(git.waitFor()).isZero();
  }

  @Test
  void initializesTheSecondRepository() throws IOException, InterruptedException {
    Process git = new ProcessBuilder("git", "init").start(); // violation: ServerOrContainerPerTest
    assertThat(git.waitFor()).isZero();
  }

  @Test
  void readsTheLog() throws IOException, InterruptedException {
    Process git = new ProcessBuilder("git", "log").start();
    assertThat(git.waitFor()).isZero();
    assertThat(watcher.isAlive()).isFalse();
  }
}
