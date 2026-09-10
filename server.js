/**
 * Enterprise Standalone WCT (Whale Cloud Technology) Gateway Mock Server
 * Built with zero external dependencies (Node.js Native HTTP module)
 * Works out-of-the-box locally and on Vercel Serverless deployments.
 * 
 * Standard API: TM Forum 621 / INF-XLI153 (OpenAPI Spec inf_adl_api.yaml)
 * 
 * Endpoints:
 * 1. POST /token - OAuth 2.0 Client Credentials Token Generation
 * 2. POST /rp-server/troubleTicket/v2/troubleTicket - Create Trouble Ticket (Supports XL Dummy MSISDN & ?duplicationToken=...)
 * 3. GET  /rp-server/troubleTicket/v2/troubleTicket/:id - Retrieve Single Trouble Ticket by ID
 * 4. GET  /rp-server/troubleTicket/v2/troubleTicket - Inspection / List All Created Tickets
 * 5. POST /simulate/expired-token - Toggle 403 Forbidden Auto-Retry Simulation
 * 6. POST /simulate/error - Toggle 500 Server Error Simulation
 * 7. POST /simulate/reset - Reset Ticket Store & Flags
 * 8. GET  /health - Health check endpoint
 * 9. GET  / - Interactive HTML Dashboard / API Overview
 */

const http = require('http');
const PORT = process.env.PORT || 8080;

let ticketCounter = 10323380;
const createdTicketsMap = new Map(); // Store by ticketId
const duplicationTokenMap = new Map(); // Store by duplicationToken for idempotency
let forceInvalidTokenOnce = false;
let forceServerErrorOnce = false;

// Helper to normalize MSISDN (support 0877..., +62877..., 62877...)
const normalizeMsisdn = (raw) => {
  if (!raw) return '';
  let str = raw.toString().trim();
  if (str.startsWith('+')) str = str.substring(1);
  if (str.startsWith('08')) str = '628' + str.substring(2);
  return str;
};

// Predefined XL Dummy MSISDN Scenarios (Prefix 62877 & 62818)
const MSISDN_SCENARIOS = {
  // === NEGATIVE SCENARIOS (Status Code embedded in last 3 digits) ===
  '628770000404': {
    statusCode: 404,
    payload: {
      code: '404',
      message: 'Subscriber MSISDN 628770000404 not found in XL / WCT repository',
      reason: 'SubscriberNotFound'
    },
    description: 'Negative: XL Dummy MSISDN Tidak Terdaftar (404 Not Found)'
  },
  '628770000400': {
    statusCode: 400,
    payload: {
      code: '400',
      message: 'Subscriber status is TERMINATED / BARRED, unable to create trouble ticket',
      reason: 'InvalidSubscriberStatus'
    },
    description: 'Negative: XL Dummy Status Terblokir / Hangus (400 Bad Request)'
  },
  '628770000409': {
    statusCode: 409,
    payload: {
      code: '409',
      message: 'Active trouble ticket #10321199 is already in progress for this MSISDN',
      reason: 'DuplicateActiveTicket'
    },
    description: 'Negative: XL Dummy Tiket Duplikat Aktif Berjalan (409 Conflict)'
  },
  '628770000403': {
    statusCode: 403,
    payload: {
      code: '403',
      message: 'Source Customer ID does not match the registered owner of MSISDN 628770000403',
      reason: 'OwnershipValidationFailed'
    },
    description: 'Negative: XL Dummy Customer ID Mismatch / Beda Pemilik (403 Forbidden)'
  },
  '628770000500': {
    statusCode: 500,
    payload: {
      code: '500',
      message: 'Internal Server Error: Downstream Whale Cloud BSS database connection failure',
      reason: 'DownstreamSystemFailure'
    },
    description: 'Negative: XL Dummy Core BSS Database Error (500 Server Error)'
  },
  '628770000504': {
    statusCode: 504,
    payload: {
      code: '504',
      message: 'Gateway Timeout: Provisioning system node did not respond within timeout window',
      reason: 'GatewayTimeout'
    },
    description: 'Negative: XL Dummy Gateway Timeout Jaringan (504 Gateway Timeout)'
  },

  // Backward compatibility with 62818 test numbers
  '628184040000': {
    statusCode: 404,
    payload: {
      code: '404',
      message: 'Subscriber MSISDN 628184040000 not found in WCT / BSS repository',
      reason: 'SubscriberNotFound'
    },
    description: 'Negative: MSISDN Tidak Ditemukan (404)'
  },
  '628184000000': {
    statusCode: 400,
    payload: {
      code: '400',
      message: 'Subscriber status is TERMINATED / BARRED',
      reason: 'InvalidSubscriberStatus'
    },
    description: 'Negative: Status Barred (400)'
  },
  '628184090000': {
    statusCode: 409,
    payload: {
      code: '409',
      message: 'Active trouble ticket already in progress',
      reason: 'DuplicateActiveTicket'
    },
    description: 'Negative: Duplikat Tiket (409)'
  },
  '628185000000': {
    statusCode: 500,
    payload: {
      code: '500',
      message: 'Internal Server Error: Downstream BSS failure',
      reason: 'DownstreamSystemFailure'
    },
    description: 'Negative: BSS Error (500)'
  },

  // === POSITIVE SCENARIOS ===
  '628770000001': {
    statusCode: 201,
    priority: 'P2',
    severity: 'Medium',
    description: 'Positive: XL Dummy Standar (Change Ownership Bridging Failed)'
  },
  '628770000002': {
    statusCode: 201,
    priority: 'P1',
    severity: 'Critical',
    description: 'Positive: XL Dummy VIP Customer Prioritas Tinggi (P1 Critical)'
  },
  '628770000003': {
    statusCode: 201,
    priority: 'P3',
    severity: 'Low',
    description: 'Positive: XL Dummy Inquiry Standar Prioritas Rendah (P3 Low)'
  },
  '628170024670': {
    statusCode: 201,
    priority: 'P2',
    severity: 'Medium',
    description: 'Positive: XL Eksisting Normal Flow (201 Created)'
  }
};

const requestHandler = (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Accept-Language, X-Delay-Ms, X-Request-ID');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let bodyData = '';
  req.on('data', chunk => {
    bodyData += chunk.toString();
  });

  req.on('end', () => {
    const timestamp = new Date().toISOString();
    const delayMs = parseInt(req.headers['x-delay-ms'] || '0', 10);

    const executeResponse = () => {
      // Parse URL and Query Parameters
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;
      const searchParams = parsedUrl.searchParams;

      console.log(`\x1b[36m[${timestamp}]\x1b[0m \x1b[33m${req.method}\x1b[0m ${pathname}`);
      if (req.headers.authorization) {
        console.log(`  \x1b[90mAuthorization:\x1b[0m ${req.headers.authorization}`);
      }

      // Helper to send JSON Response
      const sendJSON = (statusCode, payload) => {
        if (req.method === 'HEAD') {
          res.writeHead(statusCode, { 'Content-Type': 'application/json' });
          res.end();
          return;
        }
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload, null, 2));
      };

      // 1. Root / Dashboard Page
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/') {
        if (req.method === 'HEAD') {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>WCT Gateway Mock Server</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 950px; margin: 30px auto; padding: 0 20px; line-height: 1.6; color: #333; }
              h1 { color: #0056b3; border-bottom: 2px solid #0056b3; padding-bottom: 10px; }
              h2 { margin-top: 30px; color: #444; }
              .badge { background: #28a745; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
              code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; font-family: monospace; }
              table { width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 25px; }
              th, td { border: 1px solid #ddd; padding: 9px 12px; text-align: left; }
              th { background-color: #f8f9fa; }
              .method-post { color: #d9534f; font-weight: bold; }
              .method-get { color: #0275d8; font-weight: bold; }
              .status-pos { color: #28a745; font-weight: bold; }
              .status-neg { color: #d9534f; font-weight: bold; }
            </style>
          </head>
          <body>
            <h1>🚀 WCT Enterprise Gateway Mock <span class="badge">ONLINE</span></h1>
            <p>Specification: <strong>TM Forum 621 / INF-XLI153 (OpenAPI Spec inf_adl_api.yaml)</strong></p>
            <p>Active Tickets in Memory: <strong>${createdTicketsMap.size}</strong></p>

            <h2>📱 XL Dummy MSISDN Test Numbers (Positive & Negative)</h2>
            <table>
              <tr><th>XL Dummy MSISDN</th><th>Format 08...</th><th>Kondisi</th><th>Expected Status</th><th>Keterangan</th></tr>
              <tr><td><code>628770000001</code></td><td><code>087700000001</code></td><td>Positive</td><td class="status-pos">201 Created</td><td>XL Standar Normal (Change Ownership)</td></tr>
              <tr><td><code>628770000002</code></td><td><code>087700000002</code></td><td>Positive</td><td class="status-pos">201 Created</td><td>XL Prioritas Tinggi P1 (VIP Urgent)</td></tr>
              <tr><td><code>628770000003</code></td><td><code>087700000003</code></td><td>Positive</td><td class="status-pos">201 Created</td><td>XL Prioritas Rendah P3 (Inquiry)</td></tr>
              <tr><td><code>628770000404</code></td><td><code>08770000404</code></td><td>Negative</td><td class="status-neg">404 Not Found</td><td>XL MSISDN Tidak Ditemukan</td></tr>
              <tr><td><code>628770000400</code></td><td><code>08770000400</code></td><td>Negative</td><td class="status-neg">400 Bad Request</td><td>XL Status Terblokir / Hangus</td></tr>
              <tr><td><code>628770000409</code></td><td><code>08770000409</code></td><td>Negative</td><td class="status-neg">409 Conflict</td><td>XL Duplikat - Tiket Aktif Berjalan</td></tr>
              <tr><td><code>628770000403</code></td><td><code>08770000403</code></td><td>Negative</td><td class="status-neg">403 Forbidden</td><td>XL Customer ID Beda Pemilik</td></tr>
              <tr><td><code>628770000500</code></td><td><code>08770000500</code></td><td>Negative</td><td class="status-neg">500 Server Error</td><td>XL Core BSS Database Error</td></tr>
              <tr><td><code>628770000504</code></td><td><code>08770000504</code></td><td>Negative</td><td class="status-neg">504 Gateway Timeout</td><td>XL Provisioning Timeout Jaringan</td></tr>
            </table>

            <h2>🛠 API Endpoints</h2>
            <table>
              <tr><th>Method</th><th>Endpoint</th><th>Description</th></tr>
              <tr><td class="method-get">GET</td><td><code>/health</code></td><td>Health Check & Server Metrics</td></tr>
              <tr><td class="method-post">POST</td><td><code>/token</code></td><td>OAuth 2.0 Client Credentials Token</td></tr>
              <tr><td class="method-post">POST</td><td><code>/rp-server/troubleTicket/v2/troubleTicket</code></td><td>Create Trouble Ticket (Supports XL Dummy MSISDN & <code>?duplicationToken=...</code>)</td></tr>
              <tr><td class="method-get">GET</td><td><code>/rp-server/troubleTicket/v2/troubleTicket/:id</code></td><td>Retrieve Ticket by ID</td></tr>
              <tr><td class="method-get">GET</td><td><code>/rp-server/troubleTicket/v2/troubleTicket</code></td><td>List All Created Tickets</td></tr>
              <tr><td class="method-post">POST</td><td><code>/simulate/expired-token</code></td><td>Simulate 403 Forbidden for Token Auto-Retry</td></tr>
              <tr><td class="method-post">POST</td><td><code>/simulate/error</code></td><td>Simulate 500 Internal Server Error</td></tr>
              <tr><td class="method-post">POST</td><td><code>/simulate/reset</code></td><td>Reset Memory Store</td></tr>
            </table>
          </body>
          </html>
        `);
        return;
      }

      // 2. Health Check: GET /health
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/health') {
        return sendJSON(200, {
          status: 'UP',
          service: 'WCT Enterprise Gateway Mock',
          specification: 'TM Forum 621 / INF-XLI153',
          totalTicketsInStore: createdTicketsMap.size,
          forceInvalidTokenOnce,
          forceServerErrorOnce,
          timestamp
        });
      }

      // 3. OAuth Token Endpoint: POST /token
      if (req.method === 'POST' && pathname === '/token') {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Basic ')) {
          return sendJSON(401, {
            error: 'invalid_client',
            error_description: 'Missing or invalid Basic Authentication header'
          });
        }

        // Parse form-urlencoded or JSON
        let grantType = '';
        if (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams(bodyData);
          grantType = params.get('grant_type');
        } else {
          try {
            const parsed = JSON.parse(bodyData || '{}');
            grantType = parsed.grant_type;
          } catch (e) {
            const params = new URLSearchParams(bodyData);
            grantType = params.get('grant_type');
          }
        }

        const accessToken = `wct_mock_access_token_${Date.now()}`;
        console.log(`\x1b[32m  >>> OAuth Token Issued:\x1b[0m ${accessToken}`);

        return sendJSON(200, {
          access_token: accessToken,
          accessToken: accessToken,
          token_type: 'Bearer',
          tokenType: 'Bearer',
          expires_in: 3600,
          expiresIn: 3600,
          scope: 'read write'
        });
      }

      // 4. Create Trouble Ticket Endpoint: POST /rp-server/troubleTicket/v2/troubleTicket
      if (req.method === 'POST' && pathname === '/rp-server/troubleTicket/v2/troubleTicket') {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return sendJSON(401, {
            code: '401',
            message: 'Unauthorized: Missing or invalid Bearer token',
            reason: 'Unauthorized'
          });
        }

        // Simulate 403 Forbidden for token expiry & auto-retry test
        if (forceInvalidTokenOnce) {
          forceInvalidTokenOnce = false;
          console.log('\x1b[31m  >>> Simulating 403 Forbidden for Token Auto-Retry Test...\x1b[0m');
          return sendJSON(403, {
            code: '403',
            message: 'Forbidden: Access token expired on gateway server',
            reason: 'Forbidden'
          });
        }

        // Simulate 500 Server Error
        if (forceServerErrorOnce) {
          forceServerErrorOnce = false;
          console.log('\x1b[31m  >>> Simulating 500 Internal Server Error...\x1b[0m');
          return sendJSON(500, {
            code: '500',
            message: 'Internal Server Error on WCT Gateway',
            reason: 'Internal Server Error'
          });
        }

        let payload = {};
        try {
          payload = JSON.parse(bodyData || '{}');
        } catch (e) {
          return sendJSON(400, {
            code: '400',
            message: 'Invalid JSON request body syntax',
            reason: 'Bad Request'
          });
        }

        console.log(`  \x1b[90mPayload:\x1b[0m`, JSON.stringify(payload, null, 2));

        // Extract and normalize MSISDN from relatedEntity
        const relatedEntityList = payload.relatedEntity || [];
        const subEntity = relatedEntityList.find(e => e.role === 'Subscription' || e.role === 'MSISDN') || relatedEntityList[0];
        const rawMsisdn = subEntity ? subEntity.id : null;
        const targetMsisdn = normalizeMsisdn(rawMsisdn);

        // Check if MSISDN triggers a special negative or positive scenario
        if (targetMsisdn && MSISDN_SCENARIOS[targetMsisdn]) {
          const scenario = MSISDN_SCENARIOS[targetMsisdn];
          console.log(`\x1b[35m  >>> MSISDN Scenario Triggered:\x1b[0m ${targetMsisdn} - ${scenario.description}`);
          
          if (scenario.statusCode !== 201) {
            return sendJSON(scenario.statusCode, scenario.payload);
          }
          // If positive scenario has specific priority/severity
          if (scenario.priority && !payload.priority) {
            payload.priority = scenario.priority;
          }
          if (scenario.severity && !payload.severity) {
            payload.severity = scenario.severity;
          }
        }

        // Check Idempotency via duplicationToken query param
        const duplicationToken = searchParams.get('duplicationToken');
        if (duplicationToken && duplicationTokenMap.has(duplicationToken)) {
          const existingTicket = duplicationTokenMap.get(duplicationToken);
          console.log(`\x1b[33m  >>> Idempotent request detected for duplicationToken:\x1b[0m ${duplicationToken} (Ticket ID: ${existingTicket.id})`);
          return sendJSON(200, existingTicket);
        }

        ticketCounter += 1;
        const ticketId = ticketCounter.toString();
        const nowStr = new Date().toISOString();

        // Enrich characteristics with valueType according to inf_adl_api.yaml spec
        const enrichedCharacteristics = (payload.characteristic || []).map(item => ({
          name: item.name,
          value: item.value,
          valueType: item.valueType || 'String'
        }));

        const responseTicket = {
          id: ticketId,
          href: `http://${req.headers.host || 'localhost:' + PORT}/rp-server/troubleTicket/v2/troubleTicket/${ticketId}`,
          externalId: payload.externalId || `EXT-TICKET-${Date.now()}`,
          audience: payload.audience || 'Customer',
          description: payload.description || 'Trouble ticket created via COMET',
          priority: payload.priority || 'P2',
          severity: payload.severity || 'Medium',
          name: payload.name || 'Ticket name - Free text',
          ticketType: payload.ticketType || 'Service',
          ticketSubtype: payload.ticketSubtype || ['Change ownership'],
          creationDate: nowStr,
          lastUpdate: nowStr,
          modificationDate: nowStr,
          requestedResolutionDate: payload.requestedResolutionDate || null,
          expectedResolutionDate: payload.expectedResolutionDate || null,
          status: 'Submitted',
          statusChangeReason: 'Initial Ticket Creation',
          channel: payload.channel || { name: 'COMET' },
          tag: payload.tag || ['COMET', 'WCT'],
          relatedParty: payload.relatedParty || [],
          relatedEntity: payload.relatedEntity || [],
          note: payload.note || [],
          characteristic: enrichedCharacteristics
        };

        createdTicketsMap.set(ticketId, responseTicket);
        if (duplicationToken) {
          duplicationTokenMap.set(duplicationToken, responseTicket);
        }

        console.log(`\x1b[32m  >>> Successfully Created Ticket ID:\x1b[0m ${ticketId}`);
        return sendJSON(201, responseTicket);
      }

      // 5. Retrieve Single Trouble Ticket by ID: GET /rp-server/troubleTicket/v2/troubleTicket/:id
      const singleTicketMatch = pathname.match(/^\/rp-server\/troubleTicket\/v2\/troubleTicket\/([^\/\?]+)$/);
      if ((req.method === 'GET' || req.method === 'HEAD') && singleTicketMatch) {
        const targetId = singleTicketMatch[1];
        if (createdTicketsMap.has(targetId)) {
          return sendJSON(200, createdTicketsMap.get(targetId));
        } else {
          return sendJSON(404, {
            code: '404',
            message: `TroubleTicket ID ${targetId} not found`,
            reason: 'Not Found'
          });
        }
      }

      // 6. Inspection Endpoint: GET /rp-server/troubleTicket/v2/troubleTicket (List All)
      if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/rp-server/troubleTicket/v2/troubleTicket') {
        const ticketList = Array.from(createdTicketsMap.values());
        return sendJSON(200, {
          total: ticketList.length,
          tickets: ticketList
        });
      }

      // 7. Toggle 403 Forbidden Simulation Endpoint: POST /simulate/expired-token
      if (req.method === 'POST' && pathname === '/simulate/expired-token') {
        forceInvalidTokenOnce = true;
        console.log('\x1b[35m  >>> Flag 403 Forbidden Auto-Retry set to TRUE\x1b[0m');
        return sendJSON(200, {
          message: 'Next request to POST /rp-server/troubleTicket/v2/troubleTicket will return 403 Forbidden'
        });
      }

      // 8. Toggle 500 Server Error Simulation Endpoint: POST /simulate/error
      if (req.method === 'POST' && pathname === '/simulate/error') {
        forceServerErrorOnce = true;
        console.log('\x1b[35m  >>> Flag 500 Internal Server Error set to TRUE\x1b[0m');
        return sendJSON(200, {
          message: 'Next request to POST /rp-server/troubleTicket/v2/troubleTicket will return 500 Internal Server Error'
        });
      }

      // 9. Reset Memory Store: POST /simulate/reset
      if (req.method === 'POST' && pathname === '/simulate/reset') {
        createdTicketsMap.clear();
        duplicationTokenMap.clear();
        forceInvalidTokenOnce = false;
        forceServerErrorOnce = false;
        ticketCounter = 10323380;
        console.log('\x1b[35m  >>> In-memory ticket store reset successfully\x1b[0m');
        return sendJSON(200, {
          message: 'WCT Mock memory store and flags reset successfully'
        });
      }

      // 404 Not Found Fallback
      return sendJSON(404, {
        code: '404',
        message: `Endpoint ${req.method} ${pathname} not found`,
        reason: 'Not Found'
      });
    };

    if (delayMs > 0) {
      setTimeout(executeResponse, delayMs);
    } else {
      executeResponse();
    }
  });
};

const server = http.createServer(requestHandler);

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`================================================================`);
    console.log(`🚀 Standalone Enterprise WCT Gateway Mock Server on Port ${PORT}`);
    console.log(`   Dashboard:              GET  http://localhost:${PORT}/`);
    console.log(`   Health Check:           GET  http://localhost:${PORT}/health`);
    console.log(`   OAuth Token Endpoint:   POST http://localhost:${PORT}/token`);
    console.log(`   Create Ticket Endpoint: POST http://localhost:${PORT}/rp-server/troubleTicket/v2/troubleTicket`);
    console.log(`   Get Ticket by ID:       GET  http://localhost:${PORT}/rp-server/troubleTicket/v2/troubleTicket/:id`);
    console.log(`================================================================`);
  });
}

module.exports = server;
