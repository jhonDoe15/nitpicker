package f45;
import static org.mockito.Mockito.mock;
import org.mockito.Mock;

class F45Sm4 {
  @Mock static Runnable imported;
  @Mock static Runnable starred;
  @Mock static Runnable viaType;
  @Mock static Runnable viaSub;
  @Mock static Runnable viaInstance;
  @Mock static final Runnable constant = mock(Runnable.class);
  @Mock
  static
  Runnable split;
  @Mock /* c */ static Runnable commented;
}
