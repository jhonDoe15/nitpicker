from pysnmp.hlapi import UsmUserData


def poll() -> object:
    return UsmUserData("user", authKey="a-key", privKey="p-key")
