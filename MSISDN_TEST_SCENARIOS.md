# 📱 Panduan Skenario Pengujian Dummy MSISDN XL Axiata (WCT Mock)
> **Standar Provider**: Prefix Resmi XL Axiata (`0877` / `62877`)  
> **Karakteristik Nomor**: 100% Dummy Test Series (Pasti aman, tidak terikat pelanggan nyata)  
> **Target Mock Server**: `http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket`  
> **Target BSS Adaptor**: `http://localhost:7007/bssadaptor/wct/case-management/create-trouble-ticket`

Seluruh nomor di bawah ini menggunakan **Prefix Resmi XL Axiata (`62877` / `0877`)** dengan deret angka khusus pengujian (**`0000`**) dan 3 digit terakhir yang merepresentasikan **Expected HTTP Status Code** agar sangat mudah diingat saat pengujian.

Sistem mock mendukung input format `62877...`, `0877...`, maupun `+62877...`.

---

## 📋 1. Tabel Daftar Nomor Dummy MSISDN XL

| No | Dummy MSISDN XL (62) | Format Lokal (08) | Jenis | Expected Status | Skenario Kondisi |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **1** | `628770000001` | `087700000001` | 🟢 **Positif** | `201 Created` | **Normal Flow**: Kasus standar Change Ownership Bridging Failed. |
| **2** | `628770000002` | `087700000002` | 🟢 **Positif** | `201 Created` | **VIP Urgent**: Kasus prioritas tinggi `P1` / Severity `Critical`. |
| **3** | `628770000003` | `087700000003` | 🟢 **Positif** | `201 Created` | **Standard Inquiry**: Kasus prioritas rendah `P3` / Severity `Low`. |
| **4** | `628770000404` | `087700000404` | 🔴 **Negatif** | `404 Not Found` | **Nomor Tidak Terdaftar**: MSISDN belum terdaftar di sistem BSS/WCT. |
| **5** | `628770000400` | `087700000400` | 🔴 **Negatif** | `400 Bad Request` | **Status Barred / Terminated**: Nomor XL terblokir atau sudah hangus. |
| **6** | `628770000409` | `087700000409` | 🔴 **Negatif** | `409 Conflict` | **Tiket Duplikat**: Sudah ada tiket aktif yang berjalan untuk nomor ini. |
| **7** | `628770000403` | `087700000403` | 🔴 **Negatif** | `403 Forbidden` | **Ownership Mismatch**: `source customer id` bukan pemilik nomor ini. |
| **8** | `628770000500` | `087700000500` | 🔴 **Negatif** | `500 Server Error` | **Core BSS Failure**: Gangguan koneksi database core Whale Cloud. |
| **9** | `628770000504` | `087700000504` | 🔴 **Negatif** | `504 Timeout` | **Gateway Timeout**: Node provisioning upstream tidak merespon. |

---

## 🟢 2. Contoh cURL Skenario POSITIF (Success Cases)

### Skenario 1: Normal Flow Standar (MSISDN `628770000001`)
> **Ekspektasi**: Respon HTTP `201 Created` dengan ID Tiket baru otomatis.

```bash
curl -X POST http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ticket name - Free text",
    "ticketType": "Service",
    "severity": "Medium",
    "priority": "P2",
    "ticketSubtype": ["Change ownership"],
    "channel": { "name": "COMET" },
    "relatedParty": [{ "id": "2000001018" }],
    "relatedEntity": [{ "id": "628770000001", "role": "Subscription" }],
    "note": [{ "text": "Details of change ownership transition details" }],
    "characteristic": [{ "name": "caseType3", "value": "Bridging - Change ownership failed" }]
  }'
```

---

### Skenario 2: Prioritas Tinggi VIP (MSISDN `628770000002`)
> **Ekspektasi**: Respon HTTP `201 Created` dengan `priority: "P1"` dan `severity: "Critical"`.

```bash
curl -X POST http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "VIP Urgent Case - XL Priority",
    "ticketType": "Service",
    "severity": "Critical",
    "priority": "P1",
    "ticketSubtype": ["Change ownership"],
    "channel": { "name": "COMET" },
    "relatedParty": [{ "id": "2000009999" }],
    "relatedEntity": [{ "id": "628770000002", "role": "Subscription" }],
    "note": [{ "text": "Pelanggan VIP XL Priority mengalami kendala bridging" }],
    "characteristic": [{ "name": "caseType3", "value": "Bridging - Change ownership failed" }]
  }'
```

---

## 🔴 3. Contoh cURL Skenario NEGATIF (Error Cases)

### Skenario 4: MSISDN Tidak Terdaftar (MSISDN `628770000404`)
> **Ekspektasi**: HTTP Status `404 Not Found`.

```bash
curl -X POST http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test 404",
    "ticketType": "Service",
    "relatedParty": [{ "id": "2000001018" }],
    "relatedEntity": [{ "id": "628770000404", "role": "Subscription" }]
  }'
```

**Respon JSON yang Diterima:**
```json
{
  "code": "404",
  "message": "Subscriber MSISDN 628770000404 not found in XL / WCT repository",
  "reason": "SubscriberNotFound"
}
```

---

### Skenario 5: Status Nomor Terblokir / Hangus (MSISDN `628770000400`)
> **Ekspektasi**: HTTP Status `400 Bad Request`.

```bash
curl -X POST http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test 400",
    "ticketType": "Service",
    "relatedParty": [{ "id": "2000001018" }],
    "relatedEntity": [{ "id": "628770000400", "role": "Subscription" }]
  }'
```

**Respon JSON yang Diterima:**
```json
{
  "code": "400",
  "message": "Subscriber status is TERMINATED / BARRED, unable to create trouble ticket",
  "reason": "InvalidSubscriberStatus"
}
```

---

### Skenario 6: Tiket Duplikat Sedang Berjalan (MSISDN `628770000409`)
> **Ekspektasi**: HTTP Status `409 Conflict`.

```bash
curl -X POST http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test 409",
    "ticketType": "Service",
    "relatedParty": [{ "id": "2000001018" }],
    "relatedEntity": [{ "id": "628770000409", "role": "Subscription" }]
  }'
```

**Respon JSON yang Diterima:**
```json
{
  "code": "409",
  "message": "Active trouble ticket #10321199 is already in progress for this MSISDN",
  "reason": "DuplicateActiveTicket"
}
```

---

### Skenario 7: Customer ID Tidak Cocok (MSISDN `628770000403`)
> **Ekspektasi**: HTTP Status `403 Forbidden`.

```bash
curl -X POST http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test 403",
    "ticketType": "Service",
    "relatedParty": [{ "id": "9999999999" }],
    "relatedEntity": [{ "id": "628770000403", "role": "Subscription" }]
  }'
```

**Respon JSON yang Diterima:**
```json
{
  "code": "403",
  "message": "Source Customer ID does not match the registered owner of MSISDN 628770000403",
  "reason": "OwnershipValidationFailed"
}
```

---

### Skenario 8: Downstream Core BSS Failure (MSISDN `628770000500`)
> **Ekspektasi**: HTTP Status `500 Internal Server Error`.

```bash
curl -X POST http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test 500",
    "ticketType": "Service",
    "relatedParty": [{ "id": "2000001018" }],
    "relatedEntity": [{ "id": "628770000500", "role": "Subscription" }]
  }'
```

**Respon JSON yang Diterima:**
```json
{
  "code": "500",
  "message": "Internal Server Error: Downstream Whale Cloud BSS database connection failure",
  "reason": "DownstreamSystemFailure"
}
```

---

### Skenario 9: Gateway Provisioning Timeout (MSISDN `628770000504`)
> **Ekspektasi**: HTTP Status `504 Gateway Timeout`.

```bash
curl -X POST http://localhost:8080/rp-server/troubleTicket/v2/troubleTicket \
  -H "Authorization: Bearer wct_mock_access_token_12345" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test 504",
    "ticketType": "Service",
    "relatedParty": [{ "id": "2000001018" }],
    "relatedEntity": [{ "id": "628770000504", "role": "Subscription" }]
  }'
```

**Respon JSON yang Diterima:**
```json
{
  "code": "504",
  "message": "Gateway Timeout: Provisioning system node did not respond within timeout window",
  "reason": "GatewayTimeout"
}
```

---

## ⚡ 4. Pengujian Melalui BSS Adaptor Service (Port 7007)

Cukup arahkan request ke endpoint `http://localhost:7007/bssadaptor/wct/case-management/create-trouble-ticket`:

Contoh pengujian kasus negatif `404 Not Found` melalui BSS Adaptor:
```bash
curl -X POST http://localhost:7007/bssadaptor/wct/case-management/create-trouble-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Ticket name - Free text",
    "ticketType": "Service",
    "severity": "Medium",
    "priority": "P2",
    "ticketSubtype": ["Change ownership"],
    "channel": { "name": "COMET" },
    "relatedParty": [{ "id": "2000001018" }],
    "relatedEntity": [{ "id": "628770000404", "role": "Subscription" }],
    "note": [{ "text": "Details of change ownership transition details" }],
    "characteristic": [{ "name": "caseType3", "value": "Bridging - Change ownership failed" }]
  }'
```
