import os
import subprocess


def run(command, directory):
    subprocess.Popen(command, shell=True)
    subprocess.run(command, shell=True, check=True)
    os.system(command)
    os.system("tar xf *")
    helper(command, shell=True)
    return directory
