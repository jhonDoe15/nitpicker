import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
  hidden: ['test-without-assertion'],
});

const HEAD = [
  'import threading',
  '',
  'import requests',
  'from django.db import transaction',
  'from django.db.models.signals import post_save',
  'from kafka import KafkaProducer',
  'from shop.models import Order',
  '',
  'producer = KafkaProducer()',
  'LOCK = threading.Lock()',
  '',
  '',
  'def notify(sender, instance, **kwargs):',
  '    requests.post("https://hooks.example.com", json=instance.pk, timeout=3)',
  '',
  '',
  'def publish(order):',
  '    producer.send("orders", order.pk)',
  '',
  '',
];

describeRules('callbacks registered to run later', () => {
  itOutcomes('judges a registered callback as its own function', [
    [
      'a signal handler connected in a loop',
      code(
        ...HEAD,
        'def wire(models):',
        '    for model in models:',
        '        post_save.connect(notify, sender=model)',
      ),
      [],
    ],
    [
      'a timer and an event loop callback in a transaction',
      code(
        ...HEAD,
        'def place(loop, order):',
        '    with transaction.atomic():',
        '        order.save()',
        '        threading.Timer(5, notify, args=(None, order)).start()',
        '        loop.call_later(5, publish, order)',
      ),
      [],
    ],
    [
      'a scheduled job under a lock',
      code(
        ...HEAD,
        'def schedule(scheduler):',
        '    with LOCK:',
        '        scheduler.add_job(notify, "interval", minutes=5)',
      ),
      [],
    ],
    [
      'a write and a publish registered for later',
      code(
        ...HEAD,
        'def place(scheduler, order):',
        '    order.save()',
        '    scheduler.add_job(publish, args=(order,))',
      ),
      [],
    ],
    [
      'a callback the caller runs itself',
      code(
        ...HEAD,
        'def place(order):',
        '    with transaction.atomic():',
        '        order.save()',
        '        notify(None, order)',
      ),
      ['remote-call-in-transaction:24 notify() > requests.post()|transaction.atomic()'],
    ],
  ]);
});
