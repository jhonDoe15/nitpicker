package shop;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.junit.WireMockRule;
import com.github.tomakehurst.wiremock.junit5.WireMockExtension;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import org.junit.ClassRule;
import org.junit.Rule;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.springframework.boot.SpringApplication;

abstract class ServerPerTestCases {
  @RegisterExtension
  WireMockExtension perTest = WireMockExtension.newInstance().build(); // violation: ServerOrContainerPerTest

  @RegisterExtension
  static WireMockExtension shared = WireMockExtension.newInstance().build();

  private static WireMockServer startedOnce;
  private HttpServer http;

  @BeforeAll
  static void startOnce() {
    startedOnce = new WireMockServer(0);
    startedOnce.start();
  }

  @BeforeEach
  void startServers() throws IOException {
    http = HttpServer.create(new InetSocketAddress(0), 0);
    http.start(); // violation: ServerOrContainerPerTest
    SpringApplication.run(ServerPerTestCases.class); // violation: ServerOrContainerPerTest
  }

  @Test
  void stubsTheFirstCall() {
    WireMockServer server = new WireMockServer(8089);
    server.start(); // violation: ServerOrContainerPerTest
    assertThat(server.port()).isEqualTo(8089);
  }

  @Test
  void stubsTheSecondCall() {
    WireMockServer server = new WireMockServer(8089);
    server.start(); // violation: ServerOrContainerPerTest
    assertThat(server.port()).isEqualTo(8089);
  }

  @Test
  void injectsAFault() {
    WireMockServer faulty = new WireMockServer(8090);
    faulty.start();
    assertThat(faulty.port()).isEqualTo(8090);
    assertThat(startedOnce.isRunning()).isTrue();
  }
}

abstract class JUnit4ServerCases {
  @Rule public WireMockRule perTest = new WireMockRule(0); // violation: ServerOrContainerPerTest
  @ClassRule public static WireMockRule shared = new WireMockRule(0);

  @org.junit.Test
  public void usesTheServer() {
    assertThat(perTest.port()).isPositive();
  }
}
