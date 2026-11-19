import { useScripts, inFile } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
  hidden: ['test-without-assertion'],
});

describeRules('timedelta-seconds-as-total', () => {
  itOutcomes('flags the seconds or microseconds part read as a whole duration', [
    [
      'a difference of a now call and a datetime parameter',
      'from datetime import datetime\n\n\ndef stale(last_sent: datetime) -> bool:\n    now = datetime.now()\n    return (now - last_sent).seconds > 3600\n',
      ['timedelta-seconds-as-total:6 (now - last_sent).seconds'],
    ],
    [
      'a difference of two datetime calls through the module',
      'import datetime\n\n\ndef age(start):\n    return (datetime.datetime.utcnow() - start).seconds / 60\n',
      ['timedelta-seconds-as-total:5 (datetime.datetime.utcnow() - start).seconds'],
    ],
    [
      'a Django now call and a delta kept in a local',
      'from django.utils import timezone\n\n\ndef lifetime(opened_at):\n    delta = timezone.now() - opened_at\n    return delta.seconds\n',
      ['timedelta-seconds-as-total:6 delta.seconds'],
    ],
    [
      'a name typed timedelta and a timedelta call',
      'from datetime import timedelta\n\n\ndef wait(span: timedelta) -> int:\n    return span.seconds + timedelta(hours=30).seconds\n',
      [
        'timedelta-seconds-as-total:5 span.seconds',
        'timedelta-seconds-as-total:5 timedelta(hours=30).seconds',
      ],
    ],
    [
      'microseconds of a difference of dates',
      'from datetime import date\n\n\ndef gap(other: date) -> int:\n    return (date.today() - other).microseconds\n',
      ['timedelta-seconds-as-total:5 (date.today() - other).microseconds'],
    ],
    [
      'a timedelta field of the class read through self',
      'from datetime import timedelta\n\n\nclass Window:\n    span: timedelta\n\n    def size(self) -> int:\n        return self.span.seconds\n',
      ['timedelta-seconds-as-total:8 self.span.seconds'],
    ],
  ]);

  itOutcomes('leaves total_seconds, the days part and other types alone', [
    [
      'total_seconds',
      'from datetime import datetime\n\n\ndef stale(last_sent: datetime) -> bool:\n    return (datetime.now() - last_sent).total_seconds() > 3600\n',
      [],
    ],
    [
      'days read next to seconds for the same value',
      'from datetime import datetime\n\n\ndef total(start: datetime) -> int:\n    delta = datetime.now() - start\n    return delta.days * 86400 + delta.seconds\n',
      [],
    ],
    [
      'a seconds attribute of an unrelated object and an unknown value',
      'def run(timer, delta):\n    return timer.seconds + delta.seconds + (timer.start - timer.end).seconds\n',
      [],
    ],
    [
      'a rebound name and a datetime shifted by a timedelta',
      'from datetime import datetime, timedelta\n\n\ndef run(start: datetime, span: timedelta):\n    span = span * 2\n    later = start - timedelta(days=1)\n    return span.seconds, later.hour\n',
      [],
    ],
    [
      'a timedelta literal under a day',
      'from datetime import timedelta\n\n\ndef run() -> int:\n    return timedelta(hours=5).seconds + timedelta(minutes=90).seconds\n',
      [],
    ],
    [
      'a test file',
      inFile(
        'tests/test_mod.py',
        'from datetime import datetime\n\n\ndef helper(start: datetime, end: datetime) -> int:\n    return (end - start).seconds\n',
      ),
      [],
    ],
  ]);
});
