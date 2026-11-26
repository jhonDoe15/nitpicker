package e;

import java.util.Collection;
import java.util.Date;
import java.util.List;
import java.util.Objects;
import java.util.Queue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;

public class B4Undefined {
  void m(CharSequence cs, String s, Collection<String> c, List<String> l, Date d, Future<String> f, Queue<String> q, Iterable<String> it, CompletableFuture<String> cf, Object o, StringBuilder sb) {
    Objects.equals(cs, s);
    Objects.equals(s, cs);
    Objects.equals(cs, cs);
    Objects.equals(c, c);
    Objects.equals(l, l);
    Objects.equals(d, d);
    Objects.equals(f, o);
    Objects.equals(o, q);
    Objects.equals(it, o);
    Objects.equals(cf, cf);
    Objects.equals(s, s);
    Objects.equals(sb, s);
    cs.equals(s);
    s.equals(cs);
    c.equals(l);
    l.equals(c);
    d.equals(d);
    o.equals(c);
    o.equals(o);
    it.equals(it);
    equals(c);
    this.equals(cs);
    (cs).equals(s);
    cs.equals((s));
    Object x = cs.equals(s) ? s : cs;
  }

  @SuppressWarnings("UndefinedEquals")
  void s(Collection<String> c) {
    c.equals(c);
  }
}
