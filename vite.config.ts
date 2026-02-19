import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Dev-only middleware that proxies SimpleFin API requests to bypass CORS.
 * The client sends requests to /api/simplefin-proxy with the real target URL
 * in the X-Target-URL header. This plugin forwards the request server-side
 * and returns the response to the browser.
 *
 * In production (hosted mode), the Supabase Edge Functions handle SimpleFin
 * API calls directly, so this plugin is never involved.
 */
function simpleFinProxyPlugin(): Plugin {
  return {
    name: 'simplefin-proxy',
    configureServer(server) {
      server.middlewares.use('/api/simplefin-proxy', async (req, res) => {
        const targetUrl = req.headers['x-target-url'] as string | undefined;
        if (!targetUrl) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing X-Target-URL header' }));
          return;
        }

        try {
          const headers: Record<string, string> = {};
          if (req.headers['authorization']) {
            headers['Authorization'] = req.headers['authorization'] as string;
          }
          if (req.headers['content-type']) {
            headers['Content-Type'] = req.headers['content-type'] as string;
          }
          if (req.headers['content-length']) {
            headers['Content-Length'] = req.headers['content-length'] as string;
          }

          // Collect body for POST requests.
          let body: string | undefined;
          if (req.method === 'POST') {
            const chunks: Buffer[] = [];
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            body = Buffer.concat(chunks).toString();
          }

          const upstream = await fetch(targetUrl, {
            method: req.method ?? 'GET',
            headers,
            body: body || undefined,
          });

          res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('Content-Type') ?? 'text/plain',
          });
          const text = await upstream.text();
          res.end(text);
        } catch (error) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), simpleFinProxyPlugin()],
})
