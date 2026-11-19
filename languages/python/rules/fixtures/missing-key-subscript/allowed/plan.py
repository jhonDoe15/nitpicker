def plan(request):
    current = request.session.get(SESSION_KEY_PLAN)
    if current is None:
        return None
    return current
