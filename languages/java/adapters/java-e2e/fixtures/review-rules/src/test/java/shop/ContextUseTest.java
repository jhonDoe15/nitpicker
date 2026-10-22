package shop;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;

@SpringBootTest
@ExtendWith(OutputCaptureExtension.class)
@RecordApplicationEvents
class ContextUseTest {
  private OrderService service;

  @Autowired
  void setService(OrderService service) {
    this.service = service;
  }

  @Test
  void readsTheStartupOutput(CapturedOutput output) {
    assertThat(output.getOut()).isNotNull();
  }

  @Test
  void recordsEvents(ApplicationEvents events) {
    assertThat(events.stream()).isNotNull();
  }

  @Test
  void injectsThroughASetter() {
    assertThat(service).isNotNull();
  }
}
