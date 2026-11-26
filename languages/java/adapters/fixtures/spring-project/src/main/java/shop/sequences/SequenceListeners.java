package shop.sequences;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class SequenceListeners {
  private final SequenceRepository sequences;
  private final JdbcTemplate jdbc;

  public SequenceListeners(SequenceRepository sequences, JdbcTemplate jdbc) {
    this.sequences = sequences;
    this.jdbc = jdbc;
  }

  @TransactionalEventListener
  public void onAdvanced(Advanced event) {
    sequences.save(event.sequence()); // violation: SpringWriteAfterCommitDropped
  }

  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)
  public void onCompleted(Advanced event) {
    jdbc.update("insert into audit(sequence_id) values (?)", event.sequence().id()); // violation: SpringWriteAfterCommitDropped
  }

  @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
  public void beforeCommit(Advanced event) {
    sequences.save(event.sequence());
  }

  @TransactionalEventListener
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void inNewTransaction(Advanced event) {
    sequences.save(event.sequence());
  }

  @Async("auditExecutor")
  @TransactionalEventListener
  public void onAdvancedLater(Advanced event) { // violation: SpringAsyncExecutor
    sequences.save(event.sequence());
  }

  @TransactionalEventListener
  public void onAdvancedRead(Advanced event) {
    sequences.findById(event.sequence().id());
  }

  @TransactionalEventListener
  public void onAdvancedReadByName(Advanced event) {
    sequences.updatedSince(event.sequence().current());
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW) // violation: SpringNoRequiresNew
  @Component
  public static class NewTransactionListeners {
    private final SequenceRepository sequences;

    public NewTransactionListeners(SequenceRepository sequences) {
      this.sequences = sequences;
    }

    @TransactionalEventListener
    public void onAdvanced(Advanced event) {
      sequences.save(event.sequence());
    }
  }

  public record Advanced(Sequence sequence) {}
}
