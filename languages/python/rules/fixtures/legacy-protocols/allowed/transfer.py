import paramiko


def transfer(host: str) -> None:
    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.connect(host)
    client.open_sftp()
