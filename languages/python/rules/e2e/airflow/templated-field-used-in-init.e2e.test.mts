import { describe } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { itOutcomes } = useScripts({
  enabled,
  hidden: ['test-without-assertion', 'module-level-mutable-state'],
});

const AIRFLOW = [
  'from airflow.models import BaseOperator',
  '',
  '',
  'class MyOperator(BaseOperator):',
];

describe.skipIf(!enabled)('templated-field-used-in-init', () => {
  itOutcomes('flags logic on a templated parameter in __init__', [
    [
      'a default applied with a conditional expression',
      code(
        ...AIRFLOW,
        '    template_fields = ("sql_params",)',
        '',
        '    def __init__(self, *, sql_params=None, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.sql_params = sql_params if sql_params is not None else {}',
      ),
      ['templated-field-used-in-init:9 MyOperator.sql_params'],
    ],
    [
      'an attribute derived with isinstance, reported once per parameter',
      code(
        ...AIRFLOW,
        '    template_fields = ("sql_params",)',
        '',
        '    def __init__(self, *, sql_params=None, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.sql_params = sql_params',
        '        self.is_pipeline = isinstance(sql_params, list)',
        '        self.other = sql_params or {}',
      ),
      ['templated-field-used-in-init:10 MyOperator.sql_params'],
    ],
    [
      'a validation with a comparison and a raise',
      code(
        'from airflow.sensors.base import BaseSensorOperator',
        '',
        '',
        'class WaitSensor(BaseSensorOperator):',
        '    template_fields: tuple = ("mode", "bucket")',
        '',
        '    def __init__(self, mode, bucket, **kwargs):',
        '        super().__init__(**kwargs)',
        '        if mode not in ("a", "b"):',
        '            raise ValueError(mode)',
        '        self.mode = mode',
        '        self.bucket = bucket or "default"',
      ),
      [
        'templated-field-used-in-init:9 WaitSensor.mode',
        'templated-field-used-in-init:12 WaitSensor.bucket',
      ],
    ],
    [
      'a call that receives the parameter',
      code(
        ...AIRFLOW,
        '    template_fields = ["paths"]',
        '',
        '    def __init__(self, paths, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.paths = paths',
        '        self.names = [normalize(path) for path in self.paths]',
      ),
      ['templated-field-used-in-init:10 MyOperator.paths'],
    ],
    [
      'a parameter assigned to the template field under another name',
      code(
        ...AIRFLOW,
        '    template_fields = ("sql",)',
        '',
        '    def __init__(self, query, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.sql = query',
        '        self.hook = make_hook(query)',
      ),
      ['templated-field-used-in-init:10 MyOperator.query'],
    ],
    [
      'an operator that derives from a project base with the fields',
      {
        files: {
          'shop/__init__.py': '',
          'shop/base.py': code(
            'from airflow.models import BaseOperator',
            '',
            '',
            'class Base(BaseOperator):',
            '    template_fields = ("table",)',
          ),
          'shop/ops.py': code(
            'from shop.base import Base',
            '',
            '',
            'class Copy(Base):',
            '    def __init__(self, table, **kwargs):',
            '        super().__init__(**kwargs)',
            '        self.table = table.lower()',
          ),
        },
      },
      ['templated-field-used-in-init:7 Copy.table'],
    ],
    [
      'fields built from a parent tuple, a constant and an annotation',
      {
        files: {
          'parts/__init__.py': '',
          'parts/base.py': code(
            'from typing import Sequence',
            'from airflow.models import BaseOperator',
            '',
            'COMMON = ("region",)',
            '',
            '',
            'class Base(BaseOperator):',
            '    template_fields: Sequence[str] = ("table", *COMMON)',
          ),
          'parts/ops.py': code(
            'from parts.base import Base',
            '',
            '',
            'class Star(Base):',
            '    template_fields = (*Base.template_fields, "extra")',
            '',
            '    def __init__(self, extra, **kwargs):',
            '        super().__init__(**kwargs)',
            '        self.extra = extra or 1',
            '',
            '',
            'class Plus(Base):',
            '    template_fields = Base.template_fields + ("more",)',
            '',
            '    def __init__(self, region, **kwargs):',
            '        super().__init__(**kwargs)',
            '        self.region = region.lower()',
          ),
        },
      },
      ['templated-field-used-in-init:9 Star.extra', 'templated-field-used-in-init:17 Plus.region'],
    ],
  ]);

  itOutcomes('stays quiet for plain assignment and for logic outside __init__', [
    [
      'plain assignments and the logic in execute',
      code(
        ...AIRFLOW,
        '    template_fields = ("sql_params",)',
        '',
        '    def __init__(self, *, sql_params=None, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.sql_params = sql_params',
        '',
        '    def execute(self, context):',
        '        params = self.sql_params if self.sql_params is not None else {}',
        '        return isinstance(params, list)',
      ),
      [],
    ],
    [
      'logic in a render_template_fields override',
      code(
        ...AIRFLOW,
        '    template_fields = ("mode",)',
        '',
        '    def __init__(self, mode, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.mode = mode',
        '',
        '    def render_template_fields(self, context, jinja_env=None):',
        '        super().render_template_fields(context, jinja_env)',
        '        if self.mode not in ("a", "b"):',
        '            raise ValueError(self.mode)',
      ),
      [],
    ],
    [
      'logic on a parameter that is not a template field',
      code(
        ...AIRFLOW,
        '    template_fields = ("sql",)',
        '',
        '    def __init__(self, sql, retries_wanted=None, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.sql = sql',
        '        self.wanted = retries_wanted or 3',
      ),
      [],
    ],
    [
      'a class without template_fields',
      code(
        ...AIRFLOW,
        '    def __init__(self, sql, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.sql = sql.strip()',
      ),
      [],
    ],
    [
      'a class that is not an Airflow operator',
      code(
        'class Plain:',
        '    template_fields = ("sql",)',
        '',
        '    def __init__(self, sql):',
        '        self.sql = sql.strip()',
      ),
      [],
    ],
    [
      'an annotated assignment, a tuple assignment and a chained assignment',
      code(
        ...AIRFLOW,
        '    template_fields = ("sql", "conn_id", "path")',
        '',
        '    def __init__(self, sql, conn_id, path, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.sql: str = sql',
        '        self.conn_id, self.other = conn_id, 1',
        '        self.path = self.alias = path',
      ),
      [],
    ],
    [
      'a nested helper whose own parameter has the name of a template field',
      code(
        ...AIRFLOW,
        '    template_fields = ("sql",)',
        '',
        '    def __init__(self, sql, **kwargs):',
        '        super().__init__(**kwargs)',
        '        self.sql = sql',
        '        self.clean = lambda sql: sql.strip()',
        '',
        '        def helper(sql):',
        '            return sql.lower()',
        '',
        '        self.helper = helper',
      ),
      [],
    ],
    [
      'a parameter passed on to super().__init__',
      code(
        ...AIRFLOW,
        '    template_fields = ("sql",)',
        '',
        '    def __init__(self, sql, **kwargs):',
        '        super().__init__(sql=sql, **kwargs)',
        '        self.sql = sql',
      ),
      [],
    ],
  ]);
});
