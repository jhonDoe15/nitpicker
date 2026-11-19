class Response:
    pass


class View:
    def stage_ok(self) -> Response:
        return Response()

    def dispatch(self, request) -> Response:
        if request.ok:
            return self.stage_ok()
        return Response()
