from django.contrib.auth.decorators import permission_required


@permission_required("shop.view_order")
def view(request):
    if request.user.has_perm("shop.impersonate"):
        return True
    return False
