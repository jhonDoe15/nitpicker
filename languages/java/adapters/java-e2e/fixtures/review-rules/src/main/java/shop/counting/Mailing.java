package shop.counting;

import java.util.List;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.stream.StreamSupport;
import java.util.logging.Logger;
import java.util.stream.IntStream;
import java.util.stream.Stream;

public class Mailing {
  private static final Logger LOG = Logger.getLogger(Mailing.class.getName());

  private final List<String> sent;

  public Mailing(List<String> sent) {
    this.sent = sent;
  }

  private void send(String recipient) {
    sent.add(recipient);
  }

  public long notify(List<String> recipients) {
    return recipients.stream().peek(this::send).count(); // violation: PeekSkippedByCount
  }

  public long notifyAll(List<String> recipients) {
    return recipients.stream().map(String::trim).peek(a -> send(a)).count(); // violation: PeekSkippedByCount
  }

  public long mapped(List<String> recipients) {
    return recipients.stream().map(name -> { // violation: PeekSkippedByCount
      send(name);
      return name;
    }).count();
  }

  public long array(String[] recipients) {
    return Stream.of(recipients).sorted().peek(this::send).count(); // violation: PeekSkippedByCount
  }

  public long range(int total) {
    return IntStream.range(0, total).peek(index -> send("n" + index)).count(); // violation: PeekSkippedByCount
  }

  public long filtered(List<String> recipients) {
    return recipients.stream().filter(name -> !name.isEmpty()).peek(this::send).count();
  }

  public long distinct(List<String> recipients) {
    return recipients.stream().peek(this::send).distinct().count();
  }

  public long flat(List<List<String>> groups) {
    return groups.stream().flatMap(List::stream).peek(this::send).count();
  }

  public long collected(List<String> recipients) {
    return recipients.stream().peek(this::send).toList().size(); // violation: RedundantStreamStep
  }

  public long logged(List<String> recipients) {
    return recipients.stream().peek(name -> LOG.fine(name)).count();
  }

  public long pureMap(List<String> recipients) {
    return recipients.stream().map(name -> name.trim()).count();
  }

  public void each(List<String> recipients) {
    recipients.forEach(this::send);
  }

  public long consumed(List<String> recipients) {
    return recipients.stream().peek(this::send).filter(name -> name.length() > 3).count();
  }

  public long parameter(Stream<String> lines) {
    return lines.peek(this::send).count();
  }

  public long queued(ConcurrentLinkedQueue<String> queue) {
    return queue.stream().peek(this::send).count();
  }

  public long viaQueue(Queue<String> queue) {
    return queue.stream().peek(this::send).count();
  }

  public long unknownSize(java.util.Iterator<String> source) {
    return StreamSupport.stream(java.util.Spliterators.spliteratorUnknownSize(source, 0), false)
        .peek(this::send).count();
  }

  public long trimmed(List<String> recipients) {
    return recipients.stream().map(name -> {
      String trimmed = name.trim();
      return trimmed.length();
    }).count();
  }
}
