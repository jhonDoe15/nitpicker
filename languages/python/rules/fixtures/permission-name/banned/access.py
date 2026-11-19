from django.contrib.auth.decorators import permission_required


@permission_required("view_order")
def view(request):
    if request.user.has_perm("impersonate"):
        return True
    return False
