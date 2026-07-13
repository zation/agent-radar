const MAX_MCP_BODY_BYTES = 65_536;

export interface McpHttpGuardOptions {
  allowedHosts: string[];
  allowedOrigins?: string[];
}

export async function guardMcpRequest(
  request: Request,
  options: McpHttpGuardOptions
): Promise<Response | undefined> {
  const cors = corsHeaders(request);
  if (!isAllowedHost(request, options.allowedHosts)) {
    return errorResponse("forbidden_host", "MCP request host is not allowed.", 403, cors);
  }
  if (!isAllowedOrigin(request, options.allowedOrigins ?? [])) {
    return errorResponse("forbidden_origin", "MCP request origin is not allowed.", 403, cors);
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") {
    return errorResponse("method_not_allowed", "MCP Streamable HTTP accepts POST requests only.", 405, {
      ...cors,
      allow: "POST, OPTIONS"
    });
  }
  const bytes = new TextEncoder().encode(await request.clone().text()).byteLength;
  if (bytes > MAX_MCP_BODY_BYTES) {
    return errorResponse("payload_too_large", `MCP request body exceeds ${MAX_MCP_BODY_BYTES} bytes.`, 413, cors);
  }
  return undefined;
}

function isAllowedHost(request: Request, allowedHosts: string[]): boolean {
  const rawHost = request.headers.get("host") ?? new URL(request.url).host;
  let hostname: string;
  try {
    hostname = new URL(`http://${rawHost}`).hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowedHosts.some((allowed) => allowed.toLowerCase() === hostname);
}

function isAllowedOrigin(request: Request, allowedOrigins: string[]): boolean {
  const rawOrigin = request.headers.get("origin");
  if (!rawOrigin) return true;
  let origin: string;
  try {
    origin = new URL(rawOrigin).origin;
  } catch {
    return false;
  }
  const requestOrigin = new URL(request.url).origin;
  return origin === requestOrigin || allowedOrigins.some((allowed) => allowed === origin);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  return {
    "access-control-allow-origin": origin ?? "*",
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-agent-radar-llm-api-key",
    vary: "Origin"
  };
}

function errorResponse(
  error: string,
  message: string,
  status: number,
  headers: Record<string, string>
): Response {
  return new Response(JSON.stringify({ error, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers }
  });
}
