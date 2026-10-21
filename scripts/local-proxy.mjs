// Loopback-only gateway for the disposable local stack. No production use.
import http from "node:http";
import net from "node:net";
const routes = [
  ["/auth/v1", 54325, ""],
  ["/rest/v1", 54326, ""],
  ["/storage/v1", 54327, ""],
  ["/realtime/v1", 54328, "/socket"],
];
function route(url) {
  const r = routes.find(([prefix]) => url.startsWith(prefix));
  return r ? { port: r[1], path: r[2] + url.slice(r[0].length) } : null;
}
const server = http.createServer((req, res) => {
  const r = route(req.url);
  if (!r) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": req.headers.origin || "*",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers":
        req.headers["access-control-request-headers"] || "*",
    });
    res.end();
    return;
  }
  const proxy = http.request(
    {
      hostname: "127.0.0.1",
      port: r.port,
      path: r.path,
      method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${r.port}` },
    },
    (up) => {
      res.writeHead(up.statusCode, {
        ...up.headers,
        "access-control-allow-origin": req.headers.origin || "*",
        "access-control-expose-headers": "content-range,range,x-total-count",
      });
      up.pipe(res);
    },
  );
  proxy.on("error", () => {
    res.writeHead(502);
    res.end("Local backend unavailable");
  });
  req.pipe(proxy);
});
server.on("upgrade", (req, socket, head) => {
  const r = route(req.url);
  if (!r) {
    socket.destroy();
    return;
  }
  const upstream = net.connect(r.port, "127.0.0.1", () => {
    const headers = { ...req.headers, host: "realtime-dev.localhost" };
    upstream.write(
      `${req.method} ${r.path} HTTP/1.1\r\n${Object.entries(headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n")}\r\n\r\n`,
    );
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});
server.listen(54321, "127.0.0.1", () =>
  console.log("Local Supabase gateway listening on loopback port 54321."),
);
