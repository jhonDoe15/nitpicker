package shop.sequences;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderNumbers {
  private final SequenceRepository sequences;

  public OrderNumbers(SequenceRepository sequences) {
    this.sequences = sequences;
  }

  @Transactional
  public synchronized long next() { // violation: SpringLockReleasedBeforeCommit
    Sequence sequence = sequences.findById(1L).orElseThrow();
    sequence.advance();
    return sequence.current();
  }

  @Transactional(readOnly = true)
  public synchronized long peek() {
    return sequences.findById(1L).orElseThrow().current();
  }

  @Transactional
  public long nextWithDatabaseLock() {
    Sequence sequence = sequences.findById(1L).orElseThrow();
    sequence.advance();
    return sequence.current();
  }

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public synchronized long outsideTransaction() {
    return sequences.count();
  }

  @Transactional // violation: SpringProxyMethodVisibility
  private synchronized long unproxied() {
    return sequences.count();
  }

  public synchronized long cached() {
    return 0L;
  }
}
