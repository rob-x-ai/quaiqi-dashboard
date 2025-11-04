import handler from "../api/qi-history";

function createMockResponse() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let body = "";

  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
    },
    send(payload: string) {
      body = payload;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
  };
}

async function call(range: string) {
  const res = createMockResponse();
  await handler(
    {
      method: "GET",
      query: { range },
    },
    res
  );

  console.log(`Range ${range} -> status ${res.statusCode}`);
  console.log(res.body);
}

(async () => {
  await call("1h");
  await call("24h");
})();
