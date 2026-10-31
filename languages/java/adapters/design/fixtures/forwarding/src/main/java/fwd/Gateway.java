package fwd;

public class Gateway {
  private final Backend backend;

  public Gateway(Backend backend) {
    this.backend = backend;
  }

  public String fetch(String id, int retries) {
    return backend.fetch(id, retries);
  }

  public String swapped(String id, int retries) {
    return backend.fetchSwapped(retries, id);
  }

  public String constant(String id) {
    return backend.fetch(id, 3);
  }

  public String computed(String id) {
    return backend.fetch(id.trim(), 3);
  }

  public String twice(String id) {
    String first = backend.load(id);
    return first;
  }

  public String changed(String id) {
    return backend.load(id).trim();
  }

  public void send(String id) {
    backend.send(id);
  }

  public int size() {
    return backend.size();
  }

  public String ambiguous(String id) {
    return backend.load(id, 1);
  }

  public String render(Context context, String id) {
    return backend.render(context, id);
  }

  public String threaded(Context context) {
    return render(context, "x");
  }

  public String peek(Context context) {
    return context.name() + context.depth();
  }

  public String keep(Context context) {
    return String.valueOf(context);
  }

  public Context same(Context context) {
    return context;
  }

  public boolean absent(Context context) {
    return context == null;
  }

  public Runnable later(Context context) {
    return () -> backend.render(context, "y");
  }
}
