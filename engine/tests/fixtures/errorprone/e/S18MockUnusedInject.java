import static org.mockito.Mockito.when;

import org.mockito.InjectMocks;
import org.mockito.Mock;

class S18MockUnusedInject {
  @Mock private S18MockUnusedInject test;
  @InjectMocks S18MockUnusedInject t;

  public Object test() {
    when(test.test()).thenCallRealMethod();
    return null;
  }
}
