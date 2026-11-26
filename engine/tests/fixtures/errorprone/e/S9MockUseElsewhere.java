package e;

import org.mockito.Mock;
import org.mockito.Mockito;

class S9MockUseElsewhere {
  @Mock S9ElsewhereClass plain;
  @Mock S9ElsewhereDefault defaulted;
  @Mock S9ElsewhereEmpty empty;
  @Mock S9ElsewhereMarked marked;
  @Mock S9ElsewhereChild child;
  @Mock S9ElsewhereGrandChild grandChild;
  @Mock S9MockUseElsewhere fine;

  void f() {
    Mockito.mock(S9ElsewhereClass.class);
    Mockito.spy(new S9ElsewhereChild());
    Mockito.mock(S9ElsewhereMarked.class);
    Mockito.mock(S9ElsewhereGrandChild.class);
    Mockito.mock(S9MockUseElsewhere.class);
  }

  @SuppressWarnings("DoNotMock")
  void quiet() {
    Mockito.mock(S9ElsewhereEmpty.class);
  }
}
