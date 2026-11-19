package shop.wrappers;

import java.util.ArrayList;
import java.util.List;

public interface Dispatch {
  void send(String to, String body);

  void send(String to, String body, int priority);

  String render(String template, String locale, boolean strict);

  String render(String template, String locale);

  class LoggedDispatch implements Dispatch {
    private final Dispatch delegate;
    private final List<String> sent = new ArrayList<>();

    public LoggedDispatch(Dispatch delegate) {
      this.delegate = delegate;
    }

    @Override
    public void send(String to, String body) {
      sent.add(to);
      delegate.send(to, body, 0);
    }

    @Override
    public void send(String to, String body, int priority) { // violation: ForwardDropsParameter
      delegate.send(to, body);
    }

    @Override
    public String render(String template, String locale, boolean strict) { // violation: ForwardDropsParameter
      return this.delegate.render(template, locale);
    }

    @Override
    public String render(String template, String locale) {
      return delegate.render(template, locale, false);
    }
  }

  abstract class RetryingDispatch implements Dispatch {
    private final Dispatch delegate;

    protected RetryingDispatch(Dispatch delegate) {
      this.delegate = delegate;
    }

    @Override
    public void send(String to, String body, int priority) {
      delegate.send(to, body, priority);
    }

    @Override
    public void send(String to, String body) {
      send(to, body, 0);
    }

    @Override
    public String render(String template, String locale, boolean strict) {
      return render(template, locale);
    }

    @Override
    public String render(String template, String locale) {
      return delegate.render(template, locale, true);
    }

    public String render(String template) {
      return render(template, "en");
    }
  }

  class QuietDispatch implements Dispatch {
    @Override
    public void send(String to, String body) {
      send(to, body, 0);
    }

    @Override
    public void send(String to, String body, int priority) {
      if (priority > 0) {
        throw new UnsupportedOperationException("priority");
      }
    }

    @Override
    public String render(String template, String locale, boolean strict) {
      return strict ? template : locale;
    }

    @Override
    public String render(String template, String locale) {
      return render(template, locale, false);
    }
  }
}
