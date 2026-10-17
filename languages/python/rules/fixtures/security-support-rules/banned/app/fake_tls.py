import ssl


def trusting_context():
    context = ssl.create_default_context()
    context.check_hostname = False
    return context
