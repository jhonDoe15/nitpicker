import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts({
  hidden: [
    'test-without-assertion',
    'io-in-loop',
    'swallowed-exception',
    'repeated-string-literal',
  ],
});
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const CELERY = ['import requests', 'from celery import shared_task', '', '', '@shared_task'];
const SCHEDULER = [
  'import requests',
  'from apscheduler.schedulers.background import BackgroundScheduler',
  '',
  'scheduler = BackgroundScheduler()',
  '',
  '',
];
const COMMAND = [
  'import requests',
  'from django.core.management.base import BaseCommand',
  '',
  '',
  'class Command(BaseCommand):',
];

describe.skipIf(!enabled)('job-item-failure-stops-run', () => {
  it('flags a loop in a job that does I/O per item without a try around one item', () => {
    const [actual, expected] = outcomes([
      [
        'a Celery task',
        code(
          ...CELERY,
          'def sync_all(tenants):',
          '    for tenant in tenants:',
          '        requests.post("u", json=tenant)',
        ),
        ['job-item-failure-stops-run:8 sync_all|requests.post()|Celery task'],
      ],
      [
        'a Celery task of an app object',
        code(
          'import requests',
          'from celery import Celery',
          '',
          'app = Celery("shop")',
          '',
          '',
          '@app.task(bind=True)',
          'def sync_all(self, tenants):',
          '    for tenant in tenants:',
          '        requests.post("u", json=tenant)',
        ),
        ['job-item-failure-stops-run:10 sync_all|requests.post()|Celery task'],
      ],
      [
        'an APScheduler job added with add_job',
        code(
          ...SCHEDULER,
          'def nightly(accounts):',
          '    for account in accounts:',
          '        requests.get(account)',
          '',
          '',
          'scheduler.add_job(nightly, "interval", hours=1)',
        ),
        ['job-item-failure-stops-run:9 nightly|requests.get()|APScheduler job'],
      ],
      [
        'an APScheduler scheduled_job',
        code(
          ...SCHEDULER,
          '@scheduler.scheduled_job("interval", hours=1)',
          'def nightly(accounts):',
          '    for account in accounts:',
          '        requests.get(account)',
        ),
        ['job-item-failure-stops-run:10 nightly|requests.get()|APScheduler job'],
      ],
      [
        'a Django management command',
        code(
          ...COMMAND,
          '    def handle(self, *args, **options):',
          '        for channel in channels():',
          '            requests.get(channel)',
        ),
        ['job-item-failure-stops-run:8 Command.handle|requests.get()|management command'],
      ],
      [
        'a database write per item',
        code(
          ...CELERY,
          'def purge(session, accounts):',
          '    for account in accounts:',
          '        session.execute("DELETE FROM sessions WHERE account = :a", {"a": account})',
        ),
        ['job-item-failure-stops-run:8 purge|session.execute()|Celery task'],
      ],
      [
        'a command through a project base class',
        code(
          'import requests',
          'from django.core.management import BaseCommand',
          '',
          '',
          'class Base(BaseCommand):',
          '    pass',
          '',
          '',
          'class Command(Base):',
          '    def handle(self, *args, **options):',
          '        for channel in channels():',
          '            requests.get(channel)',
        ),
        ['job-item-failure-stops-run:12 Command.handle|requests.get()|management command'],
      ],
      [
        'a try whose handler raises again',
        code(
          ...CELERY,
          'def sync_all(tenants):',
          '    for tenant in tenants:',
          '        try:',
          '            requests.post("u", json=tenant)',
          '        except ValueError:',
          '            raise',
        ),
        ['job-item-failure-stops-run:9 sync_all|requests.post()|Celery task'],
      ],
      [
        'a try around the whole loop',
        code(
          ...CELERY,
          'def sync_all(tenants):',
          '    try:',
          '        for tenant in tenants:',
          '            requests.post("u", json=tenant)',
          '    except ValueError:',
          '        return None',
        ),
        ['job-item-failure-stops-run:9 sync_all|requests.post()|Celery task'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('leaves isolated items, enqueued items and other functions alone', () => {
    const [actual, expected] = outcomes([
      [
        'a try per item that records the failure',
        code(
          'import logging',
          ...CELERY,
          'def sync_all(tenants):',
          '    for tenant in tenants:',
          '        try:',
          '            requests.post("u", json=tenant)',
          '        except requests.RequestException:',
          '            logging.exception("sync failed")',
        ),
        [],
      ],
      [
        'one task per item',
        code(
          ...CELERY,
          'def sync_all(tenants):',
          '    for tenant in tenants:',
          '        sync_one.delay(tenant)',
          '',
          '',
          '@shared_task',
          'def sync_one(tenant):',
          '    requests.post("u", json=tenant)',
        ),
        [],
      ],
      [
        'suppress around the work of one item',
        code(
          'import contextlib',
          ...CELERY,
          'def sync_all(tenants):',
          '    for tenant in tenants:',
          '        with contextlib.suppress(ValueError):',
          '            requests.post("u", json=tenant)',
        ),
        [],
      ],
      [
        'an inner try inside an outer loop',
        code(
          ...CELERY,
          'def sync_all(tenants):',
          '    for tenant in tenants:',
          '        for channel in tenant.channels:',
          '            try:',
          '                requests.post("u", json=channel)',
          '            except ValueError:',
          '                continue',
        ),
        [],
      ],
      [
        'a loop inside one transaction',
        code(
          'from django.db import transaction',
          ...CELERY,
          'def close(invoices):',
          '    with transaction.atomic():',
          '        for invoice in invoices:',
          '            invoice.save()',
        ),
        [],
      ],
      [
        'a paging loop and an attempts loop over range',
        code(
          ...CELERY,
          'def pages():',
          '    for page in range(1, 10):',
          '        requests.get("u", params={"page": page})',
          '    for attempt in range(3):',
          '        requests.get("u")',
        ),
        [],
      ],
      [
        'a Celery retry for the failing item',
        code(
          ...CELERY,
          'def sync_all(self, tenants):',
          '    for tenant in tenants:',
          '        try:',
          '            requests.post("u", json=tenant)',
          '        except ValueError as exc:',
          '            raise self.retry(exc=exc)',
        ),
        [],
      ],
      [
        'a command that imports BaseCommand from the package and a project base',
        code(
          'import requests',
          'from django.core.management import BaseCommand',
          '',
          '',
          'class Base(BaseCommand):',
          '    pass',
          '',
          '',
          'class Command(Base):',
          '    def handle(self, *args, **options):',
          '        for channel in channels():',
          '            try:',
          '                requests.get(channel)',
          '            except ValueError:',
          '                continue',
        ),
        [],
      ],
      [
        'a loop that does no I/O',
        code(
          ...CELERY,
          'def total(rows):',
          '    count = 0',
          '    for row in rows:',
          '        count += row',
          '    return count',
        ),
        [],
      ],
      [
        'a loop over a literal list',
        code(...CELERY, 'def warm():', '    for url in ["a", "b"]:', '        requests.get(url)'),
        [],
      ],
      [
        'a plain function that is not a job',
        code(
          'import requests',
          '',
          '',
          'def sync_all(tenants):',
          '    for tenant in tenants:',
          '        requests.post("u", json=tenant)',
        ),
        [],
      ],
      [
        'a method of a class that is not a command',
        code(
          ...COMMAND,
          '    def handle(self, *args, **options):',
          '        return None',
          '',
          '    def sync(self, channels):',
          '        for channel in channels:',
          '            requests.get(channel)',
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });
});
