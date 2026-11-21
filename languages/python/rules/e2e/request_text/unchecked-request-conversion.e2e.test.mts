import { useRuleScripts } from '../../test-support/python-rule-scripts.mts';

const RULE = 'unchecked-request-conversion';

const { itOutcomes, describeRules } = useRuleScripts(RULE, {
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules(RULE, () => {
  itOutcomes(
    'flags unchecked UUID, int, float and Decimal conversions on request and header text',
    [
      [
        'Django request.GET UUID and int without try/except',
        'from uuid import UUID\nfrom django.http import HttpResponse\n\n\ndef view(request):\n    item_id = UUID(request.GET["id"])\n    page = int(request.GET.get("page", "1"))\n    return HttpResponse(f"{item_id}:{page}")\n',
        [`${RULE}:6 UUID(request.GET['id'])`, `${RULE}:7 int(request.GET.get('page', '1'))`],
      ],
      [
        'Flask untyped route kwarg and request.args',
        'from decimal import Decimal\nfrom flask import Flask, request\n\napp = Flask(__name__)\n\n\n@app.route("/items/<pk>")\ndef detail(pk):\n    amount = Decimal(request.args["amount"])\n    ratio = float(request.form.get("ratio", "0"))\n    return f"{int(pk)}:{amount}:{ratio}"\n',
        [
          `${RULE}:9 Decimal(request.args['amount'])`,
          `${RULE}:10 float(request.form.get('ratio', '0'))`,
          `${RULE}:11 int(pk)`,
        ],
      ],
      [
        'FastAPI str route parameter and request.headers',
        'from uuid import UUID\nfrom fastapi import FastAPI, Request\n\napp = FastAPI()\n\n\n@app.get("/items/{pk}")\ndef detail(pk: str, request: Request):\n    uid = UUID(pk)\n    limit = int(request.headers["x-limit"])\n    return {"id": str(uid), "limit": limit}\n',
        [`${RULE}:9 UUID(pk)`, `${RULE}:10 int(request.headers['x-limit'])`],
      ],
      [
        'DRF view with self.kwargs and request.query_params',
        'from uuid import UUID\nfrom rest_framework.response import Response\nfrom rest_framework.views import APIView\n\n\nclass OrderView(APIView):\n    def get(self, request):\n        uid = UUID(self.kwargs["pk"])\n        page = int(request.query_params["page"])\n        return Response({"id": str(uid), "page": page})\n',
        [`${RULE}:8 UUID(self.kwargs['pk'])`, `${RULE}:9 int(request.query_params['page'])`],
      ],
      [
        'HTTP client response.headers parsed without try/except',
        'import requests\n\n\ndef fetch_delay(url: str) -> int:\n    response = requests.get(url, timeout=10)\n    return int(response.headers["Retry-After"])\n',
        [`${RULE}:6 int(response.headers['Retry-After'])`],
      ],
      [
        'Decimal caught only with ValueError still fails on InvalidOperation',
        'from decimal import Decimal\nfrom django.http import HttpResponse\n\n\ndef price(request):\n    try:\n        value = Decimal(request.GET["amount"])\n    except ValueError:\n        return HttpResponse(status=400)\n    return HttpResponse(str(value))\n',
        [`${RULE}:7 Decimal(request.GET['amount'])`],
      ],
    ],
  );

  itOutcomes('flags Django ORM UUIDField lookups on unchecked request text', [
    [
      'Order.objects.get and get_object_or_404 with untyped pk',
      {
        files: {
          'shop/models.py':
            'from django.db import models\n\n\nclass Order(models.Model):\n    id = models.UUIDField(primary_key=True)\n',
          'shop/views.py':
            'from django.http import HttpResponse\nfrom django.shortcuts import get_object_or_404\nfrom .models import Order\n\n\ndef detail(request, pk):\n    order = Order.objects.get(pk=pk)\n    other = get_object_or_404(Order, pk=request.GET["other"])\n    return HttpResponse(f"{order}:{other}")\n',
        },
      },
      [`${RULE}:7 Order.get(pk=pk)`, `${RULE}:8 get_object_or_404(Order, pk=request.GET['other'])`],
    ],
    [
      'Django urls.py with <uuid:pk> makes route kwarg safe',
      {
        files: {
          'shop/models.py':
            'from django.db import models\n\n\nclass Order(models.Model):\n    id = models.UUIDField(primary_key=True)\n',
          'shop/urls.py':
            'from django.urls import path\nfrom . import views\n\nurlpatterns = [path("orders/<uuid:pk>/", views.detail)]\n',
          'shop/views.py':
            'from django.http import HttpResponse\nfrom .models import Order\n\n\ndef detail(request, pk):\n    order = Order.objects.get(pk=pk)\n    return HttpResponse(str(order))\n',
        },
      },
      [],
    ],
    [
      'ORM lookup guarded by ValidationError or pre-converted UUID is safe',
      {
        files: {
          'shop/models.py':
            'from django.db import models\n\n\nclass Order(models.Model):\n    id = models.UUIDField(primary_key=True)\n',
          'shop/views.py':
            'from uuid import UUID\nfrom django.core.exceptions import ValidationError\nfrom django.http import HttpResponse, HttpResponseBadRequest\nfrom .models import Order\n\n\ndef detail(request, pk):\n    try:\n        order = Order.objects.get(pk=pk)\n    except ValidationError:\n        return HttpResponseBadRequest("bad id")\n    return HttpResponse(str(order))\n\n\ndef parsed(request, pk):\n    try:\n        uid = UUID(pk)\n    except ValueError:\n        return HttpResponseBadRequest("bad id")\n    return HttpResponse(str(Order.objects.get(pk=uid)))\n',
        },
      },
      [],
    ],
  ]);

  itOutcomes('allows guarded, typed, validated and pre-checked conversions', [
    [
      'try/except and contextlib.suppress',
      'import contextlib\nfrom decimal import Decimal, InvalidOperation\nfrom uuid import UUID\nfrom django.http import HttpResponse, HttpResponseBadRequest\n\n\ndef view(request):\n    try:\n        uid = UUID(request.GET["id"])\n        amount = Decimal(request.GET["amount"])\n    except (ValueError, InvalidOperation):\n        return HttpResponseBadRequest("bad")\n    page = 1\n    with contextlib.suppress(ValueError):\n        page = int(request.GET.get("page", "1"))\n    return HttpResponse(f"{uid}:{amount}:{page}")\n',
      [],
    ],
    [
      'Flask typed route converters and FastAPI typed parameters',
      'from uuid import UUID\nfrom fastapi import FastAPI\nfrom flask import Flask\n\nflask_app = Flask(__name__)\nfast_app = FastAPI()\n\n\n@flask_app.route("/items/<uuid:pk>/<int:page>")\ndef flask_detail(pk, page):\n    return f"{UUID(str(pk))}:{int(page)}"\n\n\n@fast_app.get("/items/{pk}")\ndef fast_detail(pk: UUID, page: int = 1):\n    return {"id": str(pk), "page": page}\n',
      [],
    ],
    [
      'pre-checked with isdigit() and early-exit guard',
      'from django.http import HttpResponse, HttpResponseBadRequest\n\n\ndef view(request):\n    raw = request.GET.get("page", "")\n    page = int(raw) if raw.isdigit() else 1\n    limit = request.GET.get("limit", "")\n    if not limit.isdigit():\n        return HttpResponseBadRequest("bad limit")\n    return HttpResponse(f"{page}:{int(limit)}")\n',
      [],
    ],
    [
      'validated serializer data and Pydantic model fields',
      'from uuid import UUID\nfrom fastapi import FastAPI\nfrom pydantic import BaseModel\nfrom rest_framework.response import Response\nfrom rest_framework.views import APIView\n\napp = FastAPI()\n\n\nclass Payload(BaseModel):\n    item_id: UUID\n    page: int\n\n\n@app.post("/items")\ndef create(payload: Payload):\n    return {"id": str(payload.item_id), "page": payload.page}\n\n\nclass OrderView(APIView):\n    def post(self, request):\n        serializer = OrderSerializer(data=request.data)\n        serializer.is_valid(raise_exception=True)\n        return Response({"page": int(serializer.validated_data["page"])})\n',
      [],
    ],
  ]);
});
