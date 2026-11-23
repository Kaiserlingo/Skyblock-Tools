"""Gemeinsame Hilfen für Browser-Tests: lokaler Webserver und Chrome/Chromium.

    from web import serve, launch
    with serve() as base:                # startet einen Webserver auf einem freien Port im Projektordner
        b = await launch(playwright)     # nimmt Google Chrome, falls installiert, sonst Playwrights Chromium
"""
import contextlib, functools, http.server, os, socket, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

@contextlib.contextmanager
def serve():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(_Quiet, directory=ROOT))
    t = threading.Thread(target=srv.serve_forever, daemon=True); t.start()
    try: yield f'http://127.0.0.1:{port}/'
    finally: srv.shutdown()

async def launch(p):
    chrome = '/usr/bin/google-chrome'
    if os.path.exists(chrome):
        return await p.chromium.launch(executable_path=chrome, args=['--no-proxy-server'])
    return await p.chromium.launch()
