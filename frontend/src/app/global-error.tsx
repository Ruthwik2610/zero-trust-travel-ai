"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="login-screen">
          <section className="login-card">
            <h1>Travel AI is unavailable</h1>
            <p>Please refresh and try again.</p>
          </section>
        </main>
      </body>
    </html>
  );
}
