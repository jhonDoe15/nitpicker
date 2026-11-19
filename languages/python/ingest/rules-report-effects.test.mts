import { describe, expect, it } from 'vitest';
import { ingestRulesReport } from './rules-report.mts';

const entry = (overrides?: object) => ({
  rule: 'frozen-dataclass',
  path: 'src/order.py',
  subject: 'Order',
  line: 4,
  ...overrides,
});

describe('effect rules report', () => {
  it.each([
    [
      'io-in-loop',
      'requests.get()|remote',
      '`requests.get()` sends a remote request once per item of a loop',
    ],
    [
      'io-in-loop',
      'load_order() > repo.find_by_id()|database|concurrent',
      '`load_order()` (which calls `repo.find_by_id()`) sends a database query once per item of a loop, started concurrently',
    ],
    [
      'accumulator-copy',
      'acc|acc + [...]|reduce',
      '`acc` is replaced by a copy of itself (`acc + [...]`) on every step of the `reduce`, so the work grows with the square of the list',
    ],
    [
      'lazy-relation-in-loop',
      'Order.customer|django|Order.objects.all()',
      '`Order.customer` is a lazy relationship: `Order.objects.all()` fetches the `Order` rows without it, so each item of the loop runs one more query',
    ],
    [
      'lazy-relation-in-loop',
      'Order.customer|django|Order.objects.all()|to_dto()',
      '`to_dto()` receives each item of the loop and reads its lazy relationship `Order.customer`: `Order.objects.all()` fetches the `Order` rows without it, so each item of the loop runs one more query',
    ],
    [
      'remote-call-in-transaction',
      'requests.post()|transaction.atomic()',
      '`requests.post()` makes a remote call while `transaction.atomic()` holds a database transaction: the connection stays checked out for the remote latency, which can exhaust the pool, and the remote side effect cannot roll back with the transaction',
    ],
    [
      'discarded-new-value',
      'str.strip()',
      '`str.strip()` returns a new value and leaves the receiver unchanged, so as a statement it does nothing and the code goes on with the old value',
    ],
    [
      'discarded-new-value',
      'QuerySet.delete()|truth',
      '`QuerySet.delete()` returns a tuple, which is always true: testing it never tells whether a row was deleted or created',
    ],
    [
      'unreturned-result',
      'self.stage_ok()|Response',
      '`self.stage_ok()` returns a `Response`, the type this function returns, but the call stands as a statement: its result is dropped and the function goes on or ends without it',
    ],
    [
      'cache-write-in-transaction',
      'cache.set()|transaction.atomic()',
      '`cache.set()` writes the cache inside `transaction.atomic()`: a rollback undoes the database change but not the cache write, so other requests and nodes keep reading a value or an eviction that never happened until it expires',
    ],
    [
      'null-valued-input-key',
      "get|body.get('alt')",
      "`body.get('alt')` falls back to its default only when the key is missing: a key sent with `null` returns `None`, which then reaches code that expects a value",
    ],
    [
      'null-valued-input-key',
      "get|usage.get('tokens')|number",
      "`usage.get('tokens')` falls back to its default only when the key is missing: a key sent with `null` returns `None`, which then reaches code that expects a value, and `or 0` would also replace a real `0`, so test for `None` instead",
    ],
    [
      'null-valued-input-key',
      "in|'slug' in cleaned_input",
      "`'slug' in cleaned_input` is also true when the key is present with `null`, and the read after it then gets `None`",
    ],
    [
      'missing-key-subscript',
      'request|request.session[KEY]',
      '`request.session[KEY]` raises `KeyError` for a session that expired or a cookie, header or parameter the client left out, and the request or the update fails with it',
    ],
    [
      'missing-key-subscript',
      'coordinator|self.coordinator.data[self._id]',
      '`self.coordinator.data[self._id]` raises `KeyError` for a device that left the refreshed data, and the request or the update fails with it',
    ],
    [
      'blocking-helper-in-async',
      'load calls Order.objects.count',
      '`load calls Order.objects.count`, so this async function blocks the event loop and stalls every other task',
    ],
    [
      'blocking-helper-in-async',
      'Order.objects.first',
      '`Order.objects.first` runs in this async function and blocks the event loop while it waits for the database, a file or a lock, which stalls every other task',
    ],
    [
      'blocking-helper-in-async',
      'asyncio.get_event_loop',
      '`asyncio.get_event_loop` inside a coroutine returns a loop that may not be the running one and warns or fails on newer Python versions',
    ],
    [
      'remote-call-under-lock',
      'notify() > requests.post()|self._lock',
      '`notify()` (which calls `requests.post()`) makes a remote call while `self._lock` is held: every other caller waits for the remote latency, and a slow or hung remote service blocks them all',
    ],
    [
      'retry-without-idempotency',
      'stripe.PaymentIntent.create()|payment|@retry',
      '`stripe.PaymentIntent.create()` creates a payment object without an idempotency key inside `@retry`: when the server accepts the write and the response times out, the retry runs it a second time',
    ],
    [
      'dual-write-without-outbox',
      'place|repo.save()|producer.send()',
      '`place` writes to the database with `repo.save()` and publishes a message with `producer.send()` in two separate steps: the message can be sent for a change that is rolled back, or the change can commit and the message never be sent',
    ],
    [
      'dual-write-without-outbox',
      'place|order.save()|notify.delay()|on-commit',
      '`place` writes to the database with `order.save()` and publishes a message with `notify.delay()` in two separate steps: publishing after the commit avoids a message for a rolled-back change, but a crash right after the commit loses the message',
    ],
    [
      'templated-field-used-in-init',
      'RunQuery.sql_params',
      '`RunQuery.__init__` uses `sql_params`, a template field, before Airflow renders it: until `execute()` the value is still the unrendered `"{{ ... }}"` text, so a check, default or conversion here runs on the template and not on the value the task gets',
    ],
    [
      'filter-unescaped-value',
      'ldap|group_dn',
      '`group_dn` is put into an LDAP search filter as plain text, so a parenthesis, `*`, quote or backslash in it changes which entries match or makes the filter invalid',
    ],
    [
      'dataloader-batch-result',
      'ChannelLoader.batch_load|lookup|by_id[key]',
      'The batch function `ChannelLoader.batch_load` reads `by_id[key]` for every key: a key with no row raises, which fails the whole batch and every caller waiting on it',
    ],
    [
      'resolver-query-per-parent',
      'Order.customer|strawberry|database|services.load() > session.get()',
      'The resolver `customer` of `Order` runs once per parent and sends a database query with `services.load()` (which calls `session.get()`) each time, so a list of N parents costs N queries',
    ],
    [
      'in-memory-update',
      'Order|status,total|django',
      '`Order` rows are loaded only to set `status`, `total` to the same value on each and save them back, which one update statement does without loading the rows',
    ],
    [
      'row-for-one-column',
      'User|email|django',
      '`User` rows are loaded whole only to read `email` from each, when the query can return just that column',
    ],
    [
      'row-for-existence',
      'User|first|sqlalchemy',
      '`User` rows are loaded only to test whether one exists, when an existence query answers it',
    ],
    [
      'stale-retry',
      'session.commit()|retry loop',
      '`session.commit()` is retried after a `StaleDataError` in a retry loop that never reads the row again, so every attempt sends the same object with the old version and fails the same way, or, after a rollback, the change is lost',
    ],
    [
      'write-outside-transaction',
      'place|audit_session.add()|session.begin()',
      "`place` writes with `audit_session.add()` inside `session.begin()` through a session, connection or database alias that is not the block's: the write is not part of the transaction and commits or rolls back on its own",
    ],
    [
      'related-writes-without-transaction',
      'place|order.save()|item.save()',
      '`place` writes with `order.save()` and then with `item.save()` outside one transaction: a crash or a concurrent request between the writes leaves half-written state',
    ],
    [
      'check-then-write-race',
      'start|Project.objects.filter(...).exists()|Project.objects.create()',
      '`start` reads with `Project.objects.filter(...).exists()` and decides on `Project.objects.create()` outside a transaction and without a lock: two callers can both pass the check before either writes',
    ],
    [
      'job-item-failure-stops-run',
      'sync_all|requests.post()|Celery task',
      '`sync_all` is a Celery task whose loop calls `requests.post()` for each item with no `try` around the work of one item: the first item that raises stops every item after it until the next run, and an item that keeps failing blocks the rest for good',
    ],
    [
      'soft-delete-filter-missing',
      'count_orders|Order|deleted_at|alive()|9 of 10',
      "`count_orders` reads `Order` without the filter on `deleted_at` that 9 of 10 of the project's `Order` reads apply (`alive()`): deleted or hidden rows reach the caller",
    ],
    [
      'cache-invalidated-on-save-only',
      'invalidate_policy_cache|PolicyBinding|post_save|cache',
      '`invalidate_policy_cache` clears the cache (`cache`) on `post_save` of `PolicyBinding`, but no `post_delete` receiver of `PolicyBinding` clears it: deleting a row leaves its stale entries, so a removed PolicyBinding keeps applying until they expire',
    ],
    [
      'signal-receiver-never-connected',
      'on_order|post_save|shop.signals',
      '`on_order` is a `post_save` receiver in `shop.signals`, which no other module of the project imports: Django never runs that module, so the receiver is never connected and the signal does nothing',
    ],
    [
      'soft-delete-filter-missing',
      'images|ImageAttachment|restrict()|restrict()|9 of 10',
      "`images` reads `ImageAttachment` without `restrict()`, which 9 of 10 of the project's `ImageAttachment` reads apply: rows the project hides or scopes away reach the caller",
    ],
    [
      'database-alias-not-passed',
      'update_paths|CablePath.objects|using',
      '`update_paths` has the database alias `using` in scope, but `CablePath.objects` does not use it: the call goes to the default database, so it misses rows written through the other connection, writes to the wrong database, and a rollback leaves the other half committed',
    ],
    [
      'database-alias-not-passed',
      "move|Item.objects.using('default')|using|other",
      "`move` has the database alias `using` in scope, but `Item.objects.using('default')` passes a different one: the work goes to another database than the one this call runs against, so reads miss rows, writes land in the wrong place and a rollback leaves the other half committed",
    ],
    [
      'database-alias-not-passed',
      'forwards|Item.objects|schema_editor.connection.alias|historical',
      '`forwards` is a data migration function, but `Item.objects` uses the current model class or the default database: the class can have fields the migrated schema does not have yet, and the query ignores the database the migration runs against',
    ],
    [
      'deleted-item-filter-missing',
      'count_sku|LineItem|is_deleted|live()|5 of 6',
      "`count_sku` goes over a collection of `LineItem` without skipping items flagged by `is_deleted`, which 5 of 6 of the project's iterations over `LineItem` do (`live()`): deleted items take part in the result",
    ],
    [
      'route-without-auth',
      'list_reports|FastAPI|Depends(get_current_user)|9 of 10',
      "`list_reports` is a FastAPI route handler without the auth requirement that 9 of 10 of the project's handlers declare (`Depends(get_current_user)`): callers it was not meant for can reach it",
    ],
  ])('describes %s by its subject', (rule, subject, message) => {
    expect(ingestRulesReport(JSON.stringify([entry({ rule, subject })]))[0]?.message).toBe(message);
  });
});

describe('io-in-loop identity', () => {
  it('keeps the callee as the identity whatever the kind and path', () => {
    const report = [
      { rule: 'io-in-loop', path: 'a.py', subject: 'load() > requests.get()|remote', line: 3 },
      { rule: 'io-in-loop', path: 'a.py', subject: 'repo.get()|database|concurrent', line: 5 },
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ identity }) => identity)).toEqual([
      'load()',
      'repo.get()',
    ]);
  });

  it('drops the call boundaries of the message text from the identity', () => {
    const report = [
      { rule: 'io-in-loop', path: 'a.py', subject: 'requests.get(...).json()|remote', line: 3 },
      { rule: 'io-in-loop', path: 'a.py', subject: 'clients[...].get()|remote', line: 5 },
      { rule: 'io-in-loop', path: 'a.py', subject: 'Client().fetch_all()|remote', line: 7 },
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ identity }) => identity)).toEqual([
      'requests.get.json()',
      'clients.get()',
      'Client.fetch_all()',
    ]);
  });
});

describe('accumulator-copy identity', () => {
  it('keeps a subject that is not a call as it is', () => {
    const report = [
      { rule: 'accumulator-copy', path: 'a.py', subject: 'acc|acc + [...]|loop', line: 3 },
      { rule: 'lazy-relation-in-loop', path: 'a.py', subject: 'Order.items|django|x', line: 5 },
      {
        rule: 'lazy-relation-in-loop',
        path: 'b.py',
        subject: 'Order.items|django|x|to_dto()',
        line: 7,
      },
    ];

    expect(ingestRulesReport(JSON.stringify(report)).map(({ identity }) => identity)).toEqual([
      'acc',
      'Order.items',
      'Order.items',
    ]);
  });
});
