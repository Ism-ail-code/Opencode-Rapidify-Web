export function renderErrorPage(statusCode: number = 500, message?: string): string {
  const title = statusCode === 404 ? "Page not found"
    : statusCode === 429 ? "Too many requests"
    : statusCode === 503 ? "Service unavailable"
    : "This page didn't load";

  const description = message || (
    statusCode === 404 ? "The page you're looking for doesn't exist or has been moved."
    : statusCode === 429 ? "You've sent too many requests. Please wait and try again."
    : statusCode === 503 ? "We're doing some maintenance. Please check back soon."
    : "Something went wrong on our end. You can try refreshing or head back home."
  );

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title} — Rapidify</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #0f0a1f; color: #e4e0f0; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      .status { font-size: 4rem; font-weight: 700; background: linear-gradient(135deg, #a78bfa, #67e8f9); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
      h1 { font-size: 1.25rem; margin: 0.75rem 0 0.5rem; color: #fff; }
      p { color: #8b83a0; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1.25rem; border-radius: 0.5rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; font-size: 0.875rem; }
      .primary { background: linear-gradient(135deg, #a78bfa, #7c5cfc); color: #fff; transition: opacity 0.2s; }
      .primary:hover { opacity: 0.9; }
      .secondary { background: rgba(255,255,255,0.05); color: #e4e0f0; border-color: rgba(255,255,255,0.1); transition: background 0.2s; }
      .secondary:hover { background: rgba(255,255,255,0.1); }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="status">${statusCode}</div>
      <h1>${title}</h1>
      <p>${description}</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
