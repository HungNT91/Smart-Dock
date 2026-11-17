import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());

  // API Proxy for Google Apps Script & Google Sheets to eliminate CORS & redirect issues
  app.all('/api/gas-proxy', async (req, res) => {
    try {
      let targetUrl = (req.query.url as string) || (req.body && req.body.url);
      const sheetName = (req.query.sheetName as string) || (req.body && req.body.sheetName);

      if (!targetUrl) {
        return res.status(400).json({ error: 'Thiếu tham số url của Google Apps Script hoặc Google Sheet' });
      }

      const isGoogleSheet = targetUrl.includes('docs.google.com/spreadsheets');
      let extractedSheetId: string | null = null;

      if (isGoogleSheet) {
        // If it's a regular Google Sheet URL, convert to gviz JSON endpoint
        const sheetMatch = targetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (sheetMatch) {
          extractedSheetId = sheetMatch[1];
          const queryParams = new URLSearchParams({ tqx: 'out:json' });
          if (sheetName) queryParams.set('sheet', sheetName);
          targetUrl = `https://docs.google.com/spreadsheets/d/${extractedSheetId}/gviz/tq?${queryParams.toString()}`;
        }
      } else {
        // If Apps Script URL without action, append action=getDockData
        if (!targetUrl.includes('action=')) {
          targetUrl = targetUrl.includes('?') ? `${targetUrl}&action=getDockData` : `${targetUrl}?action=getDockData`;
        }
      }

      const method = req.method === 'POST' ? 'POST' : 'GET';
      const fetchOptions: RequestInit = {
        method,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
        },
      };

      if (method === 'POST' && req.body && req.body.data) {
        fetchOptions.body = JSON.stringify(req.body.data);
        fetchOptions.headers = {
          ...fetchOptions.headers,
          'Content-Type': 'application/json',
        };
      }

      const response = await fetch(targetUrl, fetchOptions);
      const text = await response.text();

      // Check if Google redirected to a Google Account login page
      if (
        text.includes('<!DOCTYPE html>') &&
        (text.includes('accounts.google.com') ||
          text.includes('ServiceLogin') ||
          text.includes('Sign in') ||
          text.includes('Đăng nhập'))
      ) {
        if (isGoogleSheet) {
          return res.status(403).json({
            error:
              'Google Sheet chưa được cấp quyền xem. Hãy mở Sheet của bạn -> Bấm "Chia sẻ (Share)" -> Chuyển quyền truy cập chung thành "Bất kỳ ai có đường liên kết (Người xem)".',
          });
        }
        return res.status(403).json({
          error:
            'Google Apps Script yêu cầu đăng nhập. Trong Apps Script: chọn Triển khai -> Quản lý bản triển khai -> Sửa -> Đổi "Người có quyền truy cập" thành "Bất kỳ ai (Anyone)" rồi bấm Triển khai lại.',
        });
      }

      // Handle gviz output wrapper: /*O_o*/ google.visualization.Query.setResponse({...});
      if (isGoogleSheet && text.includes('google.visualization.Query.setResponse')) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
          const gvizJson = JSON.parse(text.slice(start, end + 1));

          // If named sheet wasn't found, automatically fallback to the first sheet
          if (gvizJson.status === 'error' && sheetName && extractedSheetId) {
            try {
              const fallbackUrl = `https://docs.google.com/spreadsheets/d/${extractedSheetId}/gviz/tq?tqx=out:json`;
              const fallbackRes = await fetch(fallbackUrl, fetchOptions);
              const fallbackText = await fallbackRes.text();
              const fStart = fallbackText.indexOf('{');
              const fEnd = fallbackText.lastIndexOf('}');
              if (fStart !== -1 && fEnd !== -1) {
                const fJson = JSON.parse(fallbackText.slice(fStart, fEnd + 1));
                if (fJson.status === 'ok') {
                  return res.json({ isGviz: true, ...fJson });
                }
              }
            } catch {
              // Ignore fallback error and return original
            }
          }

          return res.json({ isGviz: true, ...gvizJson });
        }
      }

      try {
        const json = JSON.parse(text);
        return res.json(json);
      } catch {
        return res.status(502).json({
          error:
            'Google Apps Script không trả về JSON hợp lệ. Vui lòng đảm bảo bạn đã lưu tệp Code.gs và triển khai phiên bản mới nhất.',
          raw: text.slice(0, 200),
        });
      }
    } catch (err: any) {
      console.error('GAS Proxy Error:', err);
      return res.status(500).json({ error: `Lỗi kết nối từ máy chủ: ${err.message}` });
    }
  });

  // Favicon handler
  app.get('/favicon.ico', (_req, res) => {
    res.status(204).end();
  });

  // Stale PWA handlers: Cleanly handle requests from previous localhost:3000 projects
  app.get(['/sw.js', '/service-worker.js', '/registerSW.js', '/workbox-*.js'], (_req, res) => {
    res
      .status(200)
      .type('application/javascript')
      .send('self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", () => self.registration.unregister());');
  });
  app.get('/@vite-plugin-pwa/*', (_req, res) => {
    res.status(200).type('application/javascript').send('export default {};');
  });
  app.get(['/manifest.webmanifest', '/manifest.json'], (_req, res) => {
    res.status(200).json({});
  });

  // Mount Vite middlewares in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    app.use(express.static(path.resolve('dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

startServer().catch(console.error);
