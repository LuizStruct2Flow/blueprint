"""Block until the baton's Holder/State changes, print the new value, exit.

inotify, not polling: the kernel wakes us when the file is written. Nothing to
keep alive, nothing to rate-limit, one event per handoff.
"""
import ctypes, os, struct, sys, re

path = sys.argv[1]
row = re.compile(rb"^\| (Holder|State) \| (.*) \|", re.M)


def snap():
    try:
        with open(path, "rb") as fh:
            return b" ".join(m.group(0) for m in row.finditer(fh.read()))
    except OSError:
        return b""


libc = ctypes.CDLL("libc.so.6", use_errno=True)
fd = libc.inotify_init()
if fd < 0:
    sys.exit("inotify_init failed")

# Watch the DIRECTORY: signal-set.sh publishes by rename, so the inode the file
# had when we started is not the inode it has afterwards. Watching the file
# itself would see the very last write to a doomed inode and then go deaf.
IN_MOVED_TO = 0x80
IN_CLOSE_WRITE = 0x8
IN_CREATE = 0x100
d = os.path.dirname(path) or "."
if libc.inotify_add_watch(fd, d.encode(), IN_MOVED_TO | IN_CLOSE_WRITE | IN_CREATE) < 0:
    sys.exit("inotify_add_watch failed")

before = snap()
name = os.path.basename(path).encode()

while True:
    buf = os.read(fd, 4096)            # blocks in the kernel until an event
    i = 0
    hit = False
    while i + 16 <= len(buf):
        _, _, _, ln = struct.unpack_from("iIII", buf, i)
        ev = buf[i + 16 : i + 16 + ln].split(b"\0", 1)[0]
        if ev == name:
            hit = True
        i += 16 + ln
    if not hit:
        continue
    now = snap()
    if now and now != before:
        print("MIC: " + now.decode(errors="replace"))
        break
