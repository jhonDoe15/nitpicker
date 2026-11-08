package shop;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.when;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.MockedStatic;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CancellationTest {
  @Spy @InjectMocks private OrderService service; // violation: MockedSubjectInTest

  @Test
  void stubsTheSubject() {
    doReturn(true).when(service).cancel(Status.SHIPPED);
    assertThat(service.cancel(Status.SHIPPED)).isTrue();
  }

  @Test
  void mocksTheSubject() {
    OrderService mocked = mock(OrderService.class); // violation: MockedSubjectInTest
    when(mocked.cancel(Status.NEW)).thenReturn(false);
    assertThat(mocked.cancel(Status.NEW)).isFalse();
  }

  @Test
  void spiesWithoutStubbing() {
    OrderService watched = spy(new OrderService());
    assertThat(watched.cancel(Status.NEW)).isTrue();
  }

  @Test
  void mocksStatics() {
    UUID fixed = new UUID(0, 0);
    try (MockedStatic<Orders> orders = mockStatic(Orders.class); // violation: StaticMockOfProjectType
        MockedStatic<UUID> ids = mockStatic(UUID.class)) {
      orders.when(() -> Orders.isOpen(Status.SHIPPED)).thenReturn(true);
      ids.when(UUID::randomUUID).thenReturn(fixed);
      assertThat(Orders.isOpen(Status.SHIPPED)).isTrue();
      assertThat(UUID.randomUUID()).isEqualTo(fixed);
    }
  }
}
