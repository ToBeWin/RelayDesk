import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/shared/http/origin";

export default function proxy(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method) && !isSameOrigin(request)) {
    const response = NextResponse.json({ message: "Invalid request origin" }, { status: 403 });
    response.headers.set("X-Request-ID", requestId);
    return response;
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("X-Request-ID", requestId);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "same-origin");
  response.headers.set("X-Frame-Options", "DENY");
  const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  response.headers.set("Content-Security-Policy", `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'${developmentEval}`);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
