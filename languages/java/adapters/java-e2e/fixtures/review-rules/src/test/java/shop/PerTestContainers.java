package shop;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.Rule;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
abstract class ContainerPerTestCases {
  @Container
  private final PostgreSQLContainer<?> database = new PostgreSQLContainer<>("postgres:16"); // violation: ServerOrContainerPerTest

  @Container
  private static final GenericContainer<?> SHARED = new GenericContainer<>("redis:7");

  private static final GenericContainer<?> STARTED_ONCE = new GenericContainer<>("redis:7");
  private static final GenericContainer<?> STOPPED_EACH_TIME = new GenericContainer<>("redis:7");
  private final GenericContainer<?> perInstance = new GenericContainer<>("redis:7");
  private GenericContainer<?> assigned;

  @BeforeEach
  void startContainers() {
    STARTED_ONCE.start();
    STOPPED_EACH_TIME.start(); // violation: ServerOrContainerPerTest
    perInstance.start(); // violation: ServerOrContainerPerTest
    assigned = new GenericContainer<>("redis:7");
    assigned.start(); // violation: ServerOrContainerPerTest
    new GenericContainer<>("redis:7").start(); // violation: ServerOrContainerPerTest
    new GenericContainer<>("redis:7").withEnv("MODE", "test").start(); // violation: ServerOrContainerPerTest
    var inferred = new PostgreSQLContainer<>("postgres:16");
    inferred.start(); // violation: ServerOrContainerPerTest
    SHARED.withEnv("MODE", "test").start();
    startCache();
  }

  private void startCache() {
    GenericContainer<?> cache = new GenericContainer<>("redis:7");
    cache.start(); // violation: ServerOrContainerPerTest
  }

  @AfterEach
  void stopContainers() {
    STOPPED_EACH_TIME.stop();
  }

  @Test
  void readsTheDatabase() {
    assertThat(database.getDatabaseName()).isNotBlank();
    assertThat(SHARED.getDockerImageName()).contains("redis");
  }
}

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@Testcontainers
abstract class SharedInstanceContainerCases {
  @Container
  private final GenericContainer<?> sharedByInstance = new GenericContainer<>("redis:7");

  @BeforeEach
  void startOnce() {
    sharedByInstance.start();
  }

  @Test
  void usesTheContainer() {
    assertThat(sharedByInstance.getDockerImageName()).contains("redis");
  }
}

abstract class JUnit4ContainerCases {
  @Rule
  public GenericContainer<?> perTest = new GenericContainer<>("redis:7"); // violation: ServerOrContainerPerTest

  @org.junit.Test
  public void usesTheContainer() {
    assertThat(perTest.getDockerImageName()).contains("redis");
  }
}
