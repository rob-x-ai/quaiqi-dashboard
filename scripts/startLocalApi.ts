import http from "http";
import url from "url";
import handler from "../api/qi-history";

const PORT = Number(process.env.API_PORT ?? 4000);

function adaptRequest(req: http.IncomingMessage) {
  const parsed = url.parse(req.url ?? "", true);
  return {
    method: req.method,
    query: parsed.query as Record<string, string | string[]>,
  };
}

function adaptResponse(res: http.ServerResponse) {
  return {
    status(code: number) {
      res.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      res.setHeader(name, value);
    },
    send(payload: string) {
      res.end(payload);
    },
  };
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url ?? "", true);
  if (!parsed.pathname?.startsWith("/api/qi-history")) {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  try {
    await handler(adaptRequest(req), adaptResponse(res));
  } catch (error) {
    console.error("API handler crashed:", error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

server.listen(PORT, () => {
  console.log(`Local API server listening on http://localhost:${PORT}`);
});
