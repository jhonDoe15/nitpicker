import { savesClass } from './save-support.mts';

const SAVES = 'src/main/java/demo/saves';

function saveCase(name: string, before: string, after: string, lines: readonly number[]) {
  return {
    check: 'SpringDataNoSaveInLoop',
    file: `${SAVES}/${name}.java`,
    before: savesClass(name, before),
    after: savesClass(name, after),
    lines,
  };
}

function withList(text: string): string {
  return text.replace(
    'import java.util.List;',
    'import java.util.ArrayList;\nimport java.util.List;',
  );
}

const WHOLE = saveCase(
  'SaveWhole',
  `
  void whole(List<Item> all) {
    for (Item item : all) {
      items.save(item);
    }
  }
`,
  `
  void whole(List<Item> all) {
    items.saveAll(all);
  }
`,
  [19],
);

const FOR_EACH = saveCase(
  'SaveForEach',
  `
  void references(List<Item> all) {
    all.forEach(items::save);
  }

  void lambdas(Set<Item> gone) {
    gone.forEach(item -> items.delete(item));
  }
`,
  `
  void references(List<Item> all) {
    items.saveAll(all);
  }

  void lambdas(Set<Item> gone) {
    items.deleteAll(gone);
  }
`,
  [19],
);

const BUILT = {
  ...saveCase(
    'SaveBuilt',
    `
  void built(List<String> names) {
    for (String name : names) {
      if (name.isBlank()) {
        continue;
      }
      Item item = new Item();
      item.setName(name.trim());
      this.items.saveAndFlush(item);
    }
  }
`,
    `
  void built(List<String> names) {
    List<Item> toSave = new ArrayList<>();
    for (String name : names) {
      if (name.isBlank()) {
        continue;
      }
      Item item = new Item();
      item.setName(name.trim());
      toSave.add(item);
    }
    this.items.saveAllAndFlush(toSave);
  }
`,
    [19],
  ),
};

const CONDITIONAL = saveCase(
  'SaveConditional',
  `
  void fresh(List<Item> all) {
    all.forEach(item -> {
      if (item.getId() == null) {
        item.setName("new");
        items.save(item);
      }
    });
  }
`,
  `
  void fresh(List<Item> all) {
    List<Item> toSave = new ArrayList<>();
    all.forEach(item -> {
      if (item.getId() == null) {
        item.setName("new");
        toSave.add(item);
      }
    });
    items.saveAll(toSave);
  }
`,
  [19],
);

const STREAM = saveCase(
  'SaveStream',
  `
  void named(List<Item> all) {
    all.stream().filter(item -> item.getName() != null).forEach(items::save);
  }
`,
  `
  void named(List<Item> all) {
    items.saveAll(all.stream().filter(item -> item.getName() != null).toList());
  }
`,
  [19],
);

const IDS = saveCase(
  'SaveIds',
  `
  void raw(long[] ids) {
    for (long id : ids) {
      items.deleteById(id);
    }
  }
`,
  `
  void raw(long[] ids) {
    List<Long> toDelete = new ArrayList<>();
    for (long id : ids) {
      toDelete.add(id);
    }
    items.deleteAllById(toDelete);
  }
`,
  [19],
);

const NESTED = saveCase(
  'SaveNested',
  `
  void groups(List<List<Item>> groups) {
    for (List<Item> group : groups) {
      for (Item item : group) {
        item.setName("grouped");
        items.save(item);
      }
    }
  }
`,
  `
  void groups(List<List<Item>> groups) {
    for (List<Item> group : groups) {
      List<Item> toSave = new ArrayList<>();
      for (Item item : group) {
        item.setName("grouped");
        toSave.add(item);
      }
      items.saveAll(toSave);
    }
  }
`,
  [20],
);

const TOUCHED_BODY = `
  void rename(List<Item> all) {
    for (Item item : all) {
      String name = item.getName();
      if (name == null) {
        continue;
      }
      name = name.strip();
      name = name.toLowerCase();
      name = name.replace(' ', '-');
      item.setName(name);
      SAVE
    }
  }
`;

const TOUCHED = {
  ...saveCase(
    'SaveTouched',
    TOUCHED_BODY.replace('SAVE', 'this.items.save(item);'),
    `
  void rename(List<Item> all) {
    List<Item> toSave = new ArrayList<>();
    for (Item item : all) {
      String name = item.getName();
      if (name == null) {
        continue;
      }
      name = name.strip();
      name = name.toLowerCase();
      name = name.replace(' ', '-');
      item.setName(name);
      toSave.add(item);
    }
    this.items.saveAll(toSave);
  }
`,
    [19],
  ),
  base: savesClass('SaveTouched', TOUCHED_BODY.replace('SAVE', 'items.save(item);')),
};

export const SAVE_FIXED_CASES = [
  WHOLE,
  FOR_EACH,
  BUILT,
  CONDITIONAL,
  STREAM,
  IDS,
  NESTED,
  TOUCHED,
].map((entry) =>
  entry.after.includes('new ArrayList<>()') ? { ...entry, after: withList(entry.after) } : entry,
);
