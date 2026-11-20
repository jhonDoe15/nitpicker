package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.boot.test.context.SpringBootTest.WebEnvironment.RANDOM_PORT;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

abstract class TransactionalHttpTest {
  @SpringBootTest(webEnvironment = RANDOM_PORT)
  @Transactional // violation: SpringTransactionalHttpTest
  abstract static class RollsBackAroundRequests {
    @Autowired private TestRestTemplate rest;

    @Test
    void createsAnOrder() {
      assertThat(rest.getForObject("/orders/1", String.class)).isEqualTo("NEW");
    }
  }

  @SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT)
  @Transactional(readOnly = true) // violation: SpringTransactionalHttpTest
  abstract static class ReadsThePort {
    @LocalServerPort private int port;

    @Test
    void startsOnAPort() {
      assertThat(port).isEqualTo(8080);
    }
  }

  @SpringBootTest(webEnvironment = RANDOM_PORT)
  abstract static class RollsBackOneTest {
    @Autowired private TestRestTemplate rest;
    @Autowired private OrderService service;

    @Test
    @Transactional // violation: SpringTransactionalHttpTest
    void cancelsOverHttp() {
      assertThat(rest.getForObject("/orders/1/cancel", String.class)).isEqualTo("CANCELLED");
    }

    @Test
    @Transactional
    void cancelsInProcess() {
      assertThat(service).isInstanceOf(OrderService.class);
    }
  }

  @SpringBootTest(webEnvironment = RANDOM_PORT)
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  abstract static class TurnsTheTransactionOff {
    @Autowired private TestRestTemplate rest;

    @Test
    void readsAnOrder() {
      assertThat(rest.getForObject("/orders/1", String.class)).isEqualTo("NEW");
    }
  }

  @SpringBootTest(webEnvironment = RANDOM_PORT)
  @jakarta.transaction.Transactional(jakarta.transaction.Transactional.TxType.NEVER)
  abstract static class TurnsTheJakartaTransactionOff {
    @Autowired private TestRestTemplate rest;

    @Test
    void readsAnOrder() {
      assertThat(rest.getForObject("/orders/1", String.class)).isEqualTo("NEW");
    }
  }

  @SpringBootTest(webEnvironment = RANDOM_PORT)
  @Transactional
  abstract static class HoldsAClientItNeverCalls {
    @Autowired private TestRestTemplate rest;
    @Autowired private OrderService service;

    @Test
    void usesTheService() {
      assertThat(service).isInstanceOf(OrderService.class);
    }
  }

  @SpringBootTest
  @Transactional
  abstract static class RunsOnTheTestThread {
    @Autowired private OrderService service;

    @Test
    void usesTheService() {
      assertThat(service).isInstanceOf(OrderService.class);
    }
  }

  @SpringBootTest(webEnvironment = RANDOM_PORT)
  @Transactional
  abstract static class StartsAServerButCallsTheService {
    @Autowired private OrderService service;

    @Test
    void usesTheService() {
      assertThat(service).isInstanceOf(OrderService.class);
    }
  }
}
