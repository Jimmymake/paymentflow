Production setup (Ubuntu + Nginx + pm2)
======================================

1) Build frontend
-----------------
```bash
npm install
VITE_CALLBACK_BASE=https://paymentflow.mam-laka.com \
VITE_DEFAULT_CALLBACK_URL=https://paymentflow.mam-laka.com/api/v1/callback \
npm run build
```

2) Run backend on port 8081 with pm2
------------------------------------
```bash
npm install --production
PORT=8081 pm2 start server.js --name paymentflow
pm2 save
pm2 status
```

Verify:
```bash
curl -i http://127.0.0.1:8081/health
curl -i http://127.0.0.1:8081/api/v1/callback/latest
```

3) Install Nginx config
-----------------------
Copy the template and enable it (adjust root path if needed):
```bash
sudo cp deploy/nginx-paymentflow.conf /etc/nginx/sites-available/paymentflow.conf
sudo ln -sf /etc/nginx/sites-available/paymentflow.conf /etc/nginx/sites-enabled/paymentflow.conf
sudo nginx -t && sudo systemctl reload nginx
```

4) Verify externally
--------------------
```bash
curl -i https://paymentflow.mam-laka.com/api/v1/callback/latest
```

If it shows 200 with JSON, the proxy works and the frontend will capture callbacks.


