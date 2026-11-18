import { savesClass } from './save-support.mts';

const LIST_IMPORT = 'import java.util.List;';
const ARRAY_LIST_IMPORT = 'import java.util.ArrayList;\nimport java.util.List;';

const BODY = `
  void listed(List<Item> all) {
    for (Item item : all) {
      items.saveAll(List.of(item));
    }
  }

  void built(List<String> names) {
    for (String name : names) {
      Item item = new Item();
      item.setName(name);
      items.saveAll(Collections.singletonList(item));
    }
  }
`;

const AFTER = `
  void listed(List<Item> all) {
    items.saveAll(all);
  }

  void built(List<String> names) {
    List<Item> toSave = new ArrayList<>();
    for (String name : names) {
      Item item = new Item();
      item.setName(name);
      toSave.add(item);
    }
    items.saveAll(toSave);
  }
`;

const DECLINED = `
  void bodyList(List<Item> all) {
    for (Item item : all) {
      List<Item> batch = new ArrayList<>();
      batch.add(item);
      items.saveAll(batch);
    }
  }

  void resultUsed(List<Item> all) {
    for (Item item : all) {
      items.saveAll(List.of(item)).forEach(saved -> saved.setName("saved"));
    }
  }
`;

export const BATCH_CASES = [
  {
    check: 'SpringDataBatchOfOne',
    file: 'src/main/java/demo/saves/BatchOfOne.java',
    before: savesClass('BatchOfOne', BODY).replace(
      LIST_IMPORT,
      'import java.util.Collections;\nimport java.util.List;',
    ),
    after: savesClass('BatchOfOne', AFTER).replace(LIST_IMPORT, ARRAY_LIST_IMPORT),
    lines: [20],
  },
  {
    check: 'SpringDataBatchOfOne',
    file: 'src/main/java/demo/saves/BatchDeclined.java',
    before: savesClass('BatchDeclined', DECLINED).replace(LIST_IMPORT, ARRAY_LIST_IMPORT),
    after: savesClass('BatchDeclined', DECLINED).replace(LIST_IMPORT, ARRAY_LIST_IMPORT),
    lines: [],
  },
];
