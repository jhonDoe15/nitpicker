from uuid import UUID

from django.http import HttpRequest, HttpResponse


def order_detail(request: HttpRequest) -> HttpResponse:
    order_id = UUID(request.GET.get("order_id", ""))
    return HttpResponse(str(order_id))
