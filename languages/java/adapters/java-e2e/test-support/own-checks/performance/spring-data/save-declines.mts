import { savesClass } from './save-support.mts';

const DECLINED_BODY = `
  Long readsId(List<Item> all) {
    long last = 0;
    for (Item item : all) {
      items.save(item);
      last = item.getId();
    }
    return last;
  }

  void dedup(List<String> names) {
    for (String name : names) {
      if (items.existsByName(name)) {
        continue;
      }
      Item item = new Item();
      item.setName(name);
      items.save(item);
    }
  }

  void perItemFailure(List<Item> all) {
    for (Item item : all) {
      try {
        items.save(item);
      } catch (RuntimeException failure) {
        item.setName("failed");
      }
    }
  }

  Item resultUsed(List<Item> all) {
    Item saved = null;
    for (Item item : all) {
      saved = items.save(item);
    }
    return saved;
  }

  void returns(List<Item> all) {
    for (Item item : all) {
      if (item.getName() == null) {
        return;
      }
      items.save(item);
    }
  }

  void throwsInLoop(List<Item> all) {
    for (Item item : all) {
      if (item.getName() == null) {
        throw new IllegalArgumentException("no name");
      }
      items.save(item);
    }
  }

  void mixed(List<Item> all) {
    for (Item item : all) {
      if (item.getName() == null) {
        items.delete(item);
      } else {
        items.save(item);
      }
    }
  }

  void parallel(List<Item> all) {
    all.parallelStream().forEach(items::save);
    all.stream().parallel().forEach(item -> items.save(item));
  }

  void service(List<Item> all) {
    for (Item item : all) {
      audit.record(item);
      items.save(item);
    }
  }

  void helper(List<Item> all) {
    for (Item item : all) {
      check(item);
      items.save(item);
    }
  }

  void whileLoop(Iterator<Item> pending) {
    while (pending.hasNext()) {
      items.save(pending.next());
    }
  }

  void entries(Map<String, Item> byName) {
    byName.forEach((name, item) -> items.save(item));
  }

  void labelled(List<List<Item>> groups) {
    outer:
    for (List<Item> group : groups) {
      for (Item item : group) {
        if (item.getName() == null) {
          continue outer;
        }
        items.save(item);
      }
    }
  }

  void persisted(List<Item> all) {
    for (Item item : all) {
      entityManager.persist(item);
    }
  }

  void mapped(List<Item> all) {
    all.stream().map(items::save).forEach(saved -> saved.setName("saved"));
  }

  private void check(Item item) {}
`;

const BEFORE = savesClass('SaveDeclined', DECLINED_BODY).replace(
  'import java.util.List;',
  'import java.util.Iterator;\nimport java.util.List;',
);

export const SAVE_DECLINED_CASES = [
  {
    check: 'SpringDataNoSaveInLoop',
    file: 'src/main/java/demo/saves/SaveDeclined.java',
    before: BEFORE,
    after: BEFORE,
    lines: [],
  },
];
