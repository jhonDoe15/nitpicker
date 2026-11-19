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
  [21],
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
  [21],
);

const BUILT = {
  ...saveCase(
    'SaveBuilt',
    `
  public void built(List<String> names) {
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
  public void built(List<String> names) {
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
    [21],
  ),
};

const CONDITIONAL = saveCase(
  'SaveConditional',
  `
  public void fresh(List<Item> all) {
    all.forEach(item -> {
      if (item.getId() == null) {
        item.setName("new");
        items.save(item);
      }
    });
  }
`,
  `
  public void fresh(List<Item> all) {
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
  [21],
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
  [21],
);

const IDS = saveCase(
  'SaveIds',
  `
  public void raw(long[] ids) {
    for (long id : ids) {
      items.deleteById(id);
    }
  }
`,
  `
  public void raw(long[] ids) {
    List<Long> toDelete = new ArrayList<>();
    for (long id : ids) {
      toDelete.add(id);
    }
    items.deleteAllById(toDelete);
  }
`,
  [21],
);

const NESTED = saveCase(
  'SaveNested',
  `
  public void groups(List<List<Item>> groups) {
    for (List<Item> group : groups) {
      for (Item item : group) {
        item.setName("grouped");
        items.save(item);
      }
    }
  }
`,
  `
  public void groups(List<List<Item>> groups) {
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
  [22],
);

const TOUCHED_BODY = `
  public void rename(List<Item> all) {
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
  public void rename(List<Item> all) {
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
    [21],
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
