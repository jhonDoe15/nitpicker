import ftplib
import telnetlib


def transfer(host):
    telnetlib.Telnet(host)
    return ftplib.FTP(host)
