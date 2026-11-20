import { savesClass } from './save-support.mts';

const COLLECTED = `    for (String name : names) {
      Item item = new Item();
      item.setName(name);
      items.save(item);
    }`;

const UNPROTECTED_BODY = `
  public void outsideTransaction(List<String> names) {
${COLLECTED}
  }
`;

const RISKY_BODY = `
  interface Check {
    boolean passes(Item item);
  }

  public void checked(List<String> names) throws Exception {
${COLLECTED}
  }

  public void caught(List<String> names) {
    try {
${COLLECTED.replaceAll(/^/gmu, '  ')}
    } catch (IllegalStateException failure) {
      audit.record(null);
    }
  }

  public void entry(List<String> names) {
    reused(names);
  }

  public void reused(List<String> names) {
${COLLECTED}
  }

  @Transactional(noRollbackFor = IllegalStateException.class)
  public void keeps(List<String> names) {
${COLLECTED}
  }

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public void suspended(List<String> names) {
${COLLECTED}
  }

  public void deferred(List<String> names) {
    Runnable later = () -> {
${COLLECTED.replaceAll(/^/gmu, '  ')}
    };
    later.run();
  }

  void hidden(List<String> names) {
${COLLECTED}
  }

  public final void unproxied(List<String> names) {
${COLLECTED}
  }

  public void written(List<String> names) {
    for (String name : names) {
      Item item = new Item();
      item.setName(name + Thread.currentThread().getName());
      items.save(item);
    }
  }

  public void opaque(List<Item> all, Check check) {
    for (Item item : all) {
      if (check.passes(item)) {
        item.setName("checked");
        items.save(item);
      }
    }
  }
`;

const RISKY = savesClass('SaveRisky', RISKY_BODY).replace(
  'import org.springframework.transaction.annotation.Transactional;',
  [
    'import org.springframework.transaction.annotation.Propagation;',
    'import org.springframework.transaction.annotation.Transactional;',
  ].join('\n'),
);
const UNPROTECTED = savesClass('SaveUnprotected', UNPROTECTED_BODY, '');

export const SAVE_ROLLBACK_DECLINED_CASES = [
  {
    check: 'SpringDataNoSaveInLoop',
    file: 'src/main/java/demo/saves/SaveUnprotected.java',
    before: UNPROTECTED,
    after: UNPROTECTED,
    lines: [],
  },
  {
    check: 'SpringDataNoSaveInLoop',
    file: 'src/main/java/demo/saves/SaveRisky.java',
    before: RISKY,
    after: RISKY,
    lines: [],
  },
];
