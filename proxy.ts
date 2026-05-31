// middleware.ts

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/api/scrape(.*)",
  "/api/generate(.*)",
  "/api/execute(.*)",
  "/api/download(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // Allow dev secret bypass before Clerk protection
  if (process.env.NODE_ENV !== "production") {
    const devSecret = req.headers.get("x-dev-secret");
    if (devSecret === process.env.DEV_SECRET) {
      return NextResponse.next();
    }
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};