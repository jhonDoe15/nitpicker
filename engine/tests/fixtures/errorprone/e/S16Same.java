import static com.google.common.truth.Truth.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.Assert;

class S16Same {
  interface Marker {}

  static final class Final {}

  static class Open {}

  void junit(String s, Integer i, Object o, List<String> list, ArrayList<String> arrayList, Marker marker, Final f, Open open, int prim, long l) {
    Assert.assertSame(s, i);
    Assert.assertSame("message", s, i);
    Assert.assertNotSame(s, i);
    Assert.assertSame(s, o);
    Assert.assertSame(list, arrayList);
    Assert.assertSame(list, s);
    Assert.assertSame(marker, open);
    Assert.assertSame(marker, f);
    Assert.assertSame(f, marker);
    Assert.assertSame(prim, i);
    Assert.assertSame(prim, s);
    Assert.assertSame(prim, l);
    Assert.assertSame(null, s);
    Assert.assertSame(new int[0], s);
    Assert.assertSame(new int[0], new long[0]);
    Assert.assertSame(new String[0], new Integer[0]);
    junit.framework.Assert.assertSame(s, i);
    junit.framework.Assert.assertNotSame("m", i, s);
  }

  @SuppressWarnings("AssertSameIncompatible")
  void suppressed(String s, Integer i) {
    Assert.assertSame(s, i);
  }

  void truth(String s, Integer i, Object o, List<String> list, ArrayList<String> arrayList) {
    assertThat(s).isSameInstanceAs(i);
    assertThat(s).isNotSameInstanceAs(i);
    assertThat(s).isSameInstanceAs(o);
    assertThat(list).isSameInstanceAs(arrayList);
    assertThat(list).isSameInstanceAs(s);
    assertThat(list).isSameInstanceAs(null);
    assertThat(i).isSameInstanceAs(1);
    assertThat(i).isSameInstanceAs(1L);
    assertThat(5).isSameInstanceAs(s);
    assertThat("x").isEqualTo(i);
  }
}
