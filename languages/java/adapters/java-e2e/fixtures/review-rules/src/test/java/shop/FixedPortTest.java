package shop;

import static com.github.tomakehurst.wiremock.core.WireMockConfiguration.options;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.DEFINED_PORT;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.junit5.WireMockTest;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.GenericContainer;

abstract class FixedPortTest {
  private static final int STUB_PORT = 18089;
  private static final int ANY_PORT = 0;

  @Test
  void bindsFixedPorts() throws IOException {
    try (ServerSocket socket = new ServerSocket(18080)) { // violation: FixedPortInTest
      assertThat(socket.getLocalPort()).isEqualTo(18080);
    }
    HttpServer server = HttpServer.create(new InetSocketAddress(18081), 0); // violation: FixedPortInTest
    server.stop(0);
    HttpServer local = HttpServer.create(new InetSocketAddress("localhost", 18082), 0); // violation: FixedPortInTest
    local.stop(0);
    WireMockServer stub = new WireMockServer(STUB_PORT); // violation: FixedPortInTest
    WireMockServer configured = new WireMockServer(options().port(18083)); // violation: FixedPortInTest
    assertThat(stub.isRunning()).isEqualTo(configured.isRunning());
  }

  @Test
  void bindsFreePorts() throws IOException {
    try (ServerSocket socket = new ServerSocket(0)) {
      assertThat(socket.getLocalPort()).isPositive();
    }
    HttpServer server = HttpServer.create(new InetSocketAddress(ANY_PORT), 0);
    server.stop(0);
    WireMockServer stub = new WireMockServer(options().dynamicPort());
    InetSocketAddress remote = new InetSocketAddress("orders.example", 8080);
    assertThat(remote.getPort()).isEqualTo(8080);
    assertThat(stub.isRunning()).isFalse();
  }

  @Test
  void pinsAContainerPort() {
    try (GenericContainer<?> cache = new GenericContainer<>("redis:7")) {
      cache.setPortBindings(List.of("6379:6379")); // violation: FixedPortInTest
      cache.setPortBindings(List.of(ANY_PORT + ":6379"));
      cache.addExposedPort(6379);
      assertThat(cache.getExposedPorts()).containsExactly(6379);
    }
  }

  @WireMockTest(httpPort = 18084) // violation: FixedPortInTest
  abstract static class StubOnAFixedPort {}

  @WireMockTest
  abstract static class StubOnAFreePort {}

  @SpringBootTest(webEnvironment = DEFINED_PORT, properties = "server.port=18085") // violation: FixedPortInTest
  abstract static class PortProperty {}

  @SpringBootTest(webEnvironment = DEFINED_PORT) // violation: FixedPortInTest
  @TestPropertySource(properties = {"server.port=18086", "orders.port=18087"})
  abstract static class PortInPropertySource {}

  @SpringBootTest(webEnvironment = DEFINED_PORT)
  abstract static class PortFromTheConfiguration {}

  @SpringBootTest(webEnvironment = DEFINED_PORT, properties = "server.port=0")
  abstract static class DefinedButFree {}

  @SpringBootTest(webEnvironment = RANDOM_PORT, properties = "server.port=18088")
  abstract static class RandomPortWins {}

  @SpringBootTest(properties = "server.port=18089")
  abstract static class NoServer {}
}
