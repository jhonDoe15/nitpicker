from airflow.models import BaseOperator


class RunQuery(BaseOperator):
    template_fields = ("sql_params",)

    def __init__(self, *, sql_params=None, **kwargs):
        super().__init__(**kwargs)
        self.sql_params = sql_params

    def execute(self, context):
        params = self.sql_params if self.sql_params is not None else {}
        return params
