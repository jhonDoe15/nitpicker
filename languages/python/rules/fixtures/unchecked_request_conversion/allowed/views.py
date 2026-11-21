from uuid import UUID

from django.http import HttpRequest, HttpResponse, HttpResponseBadRequest


def order_detail(request: HttpRequest) -> HttpResponse:
    raw = request.GET.get("order_id", "")
    try:
        order_id = UUID(raw)
    except ValueError:
        return HttpResponseBadRequest("invalid order_id")
    return HttpResponse(str(order_id))
