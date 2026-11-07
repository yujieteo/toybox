import sys


def say(text: str) -> None:
    _ = sys.stderr.write(text + "\n")


def show(text: str) -> None:
    _ = sys.stdout.write(text + "\n")
