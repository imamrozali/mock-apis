# 🚀 WCT Enterprise Gateway Mock Server (TM Forum 621 / INF-XLI153)

Standalone Mock Server untuk **Whale Cloud Technology (WCT) Gateway** yang dirancang khusus untuk integrasi microservice **COMET (SRH -> OFM/VQM -> BSS Adaptor -> WCT)**. 
Dibuat dengan **zero external dependencies** (native Node.js `http`), sehingga dapat langsung dijalankan tanpa `npm install` dan support deployment Vercel.

---

## 📌 Fitur Utama

1. **OAuth 2.0 Client Credentials Grant**:
   - Endpoint: `POST /token`
   - Mendukung header `Authorization: Basic ...` dan form-body `grant_type=client_credentials`.
   - Mengembalikan `access_token`, `token_type: "bearer"`, `expires_in: 3600`, dan `scope: "read write"`.

2. **Create Trouble Ticket (TM Forum 621 / INF-XLI153)**:
   - Endpoint: `POST /rp-server/troubleTicket/v2/troubleTicket`
   - **Query Param Idempotency**: Mendukung parameter `?duplicationToken=<token>`. Request berulang dengan token yang sama akan mengembalikan tiket yang sama secara idempoten (HTTP 200).
   - Validasi header `Authorization: Bearer <token>`.
   - Menghasilkan ID tiket otomatis (misal `10323381`, `10323382`, dst) beserta response lengkap (`status: "Submitted"`, `characteristic`, `relatedParty`, `channel`, dll).
   - Mengembalikan HTTP Status `201 Created`.

3. **Retrieve Ticket by ID**:
   - Endpoint: `GET /rp-server/troubleTicket/v2/troubleTicket/:id`
   - Mengambil data tiket tersimpan berdasarkan ID tiket.

4. **Inspection / List All Created Tickets**:
   - Endpoint: `GET /rp-server/troubleTicket/v2/troubleTicket`
   - Menampilkan total tiket tersimpan dalam memory beserta seluruh datanya.

5. **Simulation Helpers (Testing Resiliency)**:
   - `POST /simulate/expired-token` - Menguji fitur **Auto-Retry 1x BSS Adaptor** (request berikutnya akan merespon `403 Forbidden`).
   - `POST /simulate/error` - Menguji handling error (request berikutnya merespon `500 Internal Server Error`).
   - `POST /simulate/reset` - Me-reset in-memory store dan flag simulasi ke kondisi awal.
   - `GET /health` - Health check status dan metrik server mock.
   - `GET /` - Tampilan Dashboard HTML interaktif di browser.

---

## 🚀 Cara Menjalankan Server Secara Lokal

### Menjalankan Server (Default Port 8080):
```bash
cd /Users/muhammadimamrozali/XLSMART/BAU/repo-mock/mock-api-tests
npm start
# Atau langsung: node server.js
# Atau dengan custom port: PORT=8080 node server.js
```

---

## ⚙️ Konfigurasi di Microservice `bss-adapter-service`

Pada file `bss-adapter-service/src/main/resources/application.properties`:

```properties
############ WCT (Whale Cloud Technology) ###########
# Jika menggunakan mock lokal:
wct.casemanagement.create.trouble.ticket.url=http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket
wct.access-token.url=http://localhost:8080/token
wct.access-token.basic.auth-code=Yk1tM3hQcWVPSk1EYTZubkdPaXh1UE9yYks4YTpXWGRoSlk0d1lkWXp0MUFSa3AwVEZjb0F2S2Nh
wct.token-expiry-time=60000

# Atau jika menggunakan mock di Vercel:
# wct.casemanagement.create.trouble.ticket.url=https://mock-api-tests.vercel.app/rp-server/troubleTicket/v2/troubleTicket
# wct.access-token.url=https://mock-api-tests.vercel.app/token
```

---

## 🧪 Kumpulan Contoh cURL Pengujian

### 1. Health Check
```bash
curl -s http://localhost:8080/health
```

### 2. Request OAuth Access Token
```bash
curl -X POST http://localhost:8080/token \
  -H "Authorization: Basic Yk1tM3hQcWVPSk1EYTZubkdPaXh1UE9yYks4YTpXWGRoSlk0d1lkWXp0MUFSa3AwVEZjb0F2S2Nh" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials"
```

### 3. Create Trouble Ticket (dengan `duplicationToken`)
```bash
curl -X POST "http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket?duplicationToken=DUP-TEST-001" \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kendala Internet Lambat",
    "description": "Pelanggan melaporkan koneksi sering putus",
    "severity": "Medium",
    "priority": "P2",
    "ticketType": "Trouble Ticket",
    "ticketSubtype": ["Internet Connection Issue"],
    "channel": { "name": "COMET" },
    "relatedParty": [
      {
        "id": "100234",
        "name": "Ahmad Rozali",
        "role": "Customer"
      }
    ],
    "characteristic": [
      {
        "name": "caseType3",
        "value": "Broadband Issue"
      }
    ]
  }'
```

### 4. Get Ticket by ID
```bash
curl -s http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket/10323381
```

### 5. List All Created Tickets
```bash
curl -s http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket
```

### 6. Simulasi Token Expired (Uji Auto-Retry 403)
```bash
curl -X POST http://localhost:8080/simulate/expired-token
```
*(Request berikutnya ke `create trouble ticket` akan merespon 403 Forbidden untuk memastikan BSS Adaptor meng-invoke token refresh otomatis lalu retry 1x)*
