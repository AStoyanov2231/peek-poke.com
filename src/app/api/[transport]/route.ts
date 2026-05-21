import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const TEST_LAT = 43.2141;
const TEST_LNG = 27.9147;
const WIDGET_URI = "ui://widget/nearby-map.html";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Static map widget: uses Mapbox Static Images API (<img>) — no CDN JS needed.
// Falls back to a plain user list if the image request is blocked.
const WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; }
    #map-wrap { position: relative; width: 100%; height: 300px; overflow: hidden; background: #e8e8e8; }
    #map-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    #pins { position: absolute; inset: 0; pointer-events: none; }
    .pin { position: absolute; transform: translate(-50%, -50%); pointer-events: auto; cursor: pointer; }
    .avatar {
      width: 32px; height: 32px; border-radius: 50%;
      border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      background: #7c3aed; color: white; font-weight: 700; font-size: 13px;
      display: flex; align-items: center; justify-content: center; overflow: hidden;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .tip {
      display: none; position: absolute; bottom: 38px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,0.82); color: white; border-radius: 6px;
      padding: 4px 8px; font-size: 11px; white-space: nowrap; z-index: 10;
    }
    .pin:hover .tip { display: block; }
    .center-dot {
      position: absolute; width: 10px; height: 10px; border-radius: 50%;
      background: #7c3aed; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      transform: translate(-50%, -50%); pointer-events: none;
    }
    #bar {
      padding: 8px 12px; font-size: 12px; color: #555; background: white;
      border-top: 1px solid #eee; display: flex; align-items: center; justify-content: space-between;
    }
    #expand-btn {
      background: none; border: 1px solid #7c3aed; color: #7c3aed;
      border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer;
    }
    #expand-btn:hover { background: #f3f0ff; }
    #fallback { display: none; padding: 12px; }
    #fallback ul { padding-left: 16px; font-size: 13px; color: #333; margin-top: 4px; }
    #loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: #888; }
  </style>
</head>
<body>
  <div id="map-wrap">
    <div id="loading">Loading map…</div>
    <img id="map-img" alt="Map" style="display:none" />
    <div id="pins"></div>
  </div>
  <div id="fallback"></div>
  <div id="bar">
    <span id="status">—</span>
    <button id="expand-btn" onclick="expand()">⛶ Expand</button>
  </div>

  <script>
    const TOKEN = '${MAPBOX_TOKEN}';
    const W = 600, H = 300;

    function zoomFor(r) {
      if (r <= 0.5) return 15;
      if (r <= 1)   return 14;
      if (r <= 2)   return 13;
      if (r <= 5)   return 12;
      if (r <= 10)  return 11;
      return 10;
    }

    function toPixel(lat, lng, cLat, cLng, z) {
      const scale = 512 * Math.pow(2, z) / 360;
      const x = W / 2 + (lng - cLng) * scale;
      const y = H / 2 - (lat - cLat) * scale / Math.cos(cLat * Math.PI / 180);
      return { x, y };
    }

    function dist(lat1, lng1, lat2, lng2) {
      const R = 6371, dL = (lat2-lat1)*Math.PI/180, dN = (lng2-lng1)*Math.PI/180;
      const a = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dN/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function render(data) {
      if (!data) return;
      const { users = [], center = { lat: 43.2141, lng: 27.9147 }, radius_km = 5 } = data;
      const z = zoomFor(radius_km);

      const img = document.getElementById('map-img');
      img.style.display = 'none';
      document.getElementById('loading').style.display = 'flex';
      document.getElementById('fallback').style.display = 'none';

      img.onload = () => {
        document.getElementById('loading').style.display = 'none';
        img.style.display = 'block';
        renderPins(users, center, z);
      };
      img.onerror = () => {
        document.getElementById('loading').style.display = 'none';
        renderFallback(users, radius_km);
      };

      img.src = \`https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/\${center.lng},\${center.lat},\${z},0/\${W}x\${H}?access_token=\${TOKEN}&attribution=false&logo=false\`;

      const n = users.length;
      document.getElementById('status').textContent = n > 0
        ? \`\${n} user\${n > 1 ? 's' : ''} within \${radius_km} km of Varna\`
        : \`No users within \${radius_km} km\`;
    }

    function renderPins(users, center, z) {
      const layer = document.getElementById('pins');
      layer.innerHTML = '';

      const dot = document.createElement('div');
      dot.className = 'center-dot';
      dot.style.left = '50%';
      dot.style.top = '50%';
      layer.appendChild(dot);

      users.filter(u => u.lat && u.lng).forEach(u => {
        const { x, y } = toPixel(u.lat, u.lng, center.lat, center.lng, z);
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) return;

        const name = u.displayName || u.username;
        const pin = document.createElement('div');
        pin.className = 'pin';
        pin.style.left = x + 'px';
        pin.style.top = y + 'px';

        const av = document.createElement('div');
        av.className = 'avatar';
        if (u.avatarUrl) {
          const im = document.createElement('img');
          im.src = u.avatarUrl;
          im.onerror = () => { im.remove(); av.textContent = name[0].toUpperCase(); };
          av.appendChild(im);
        } else {
          av.textContent = name[0].toUpperCase();
        }

        const tip = document.createElement('div');
        tip.className = 'tip';
        tip.textContent = \`\${name} · \${dist(center.lat, center.lng, u.lat, u.lng).toFixed(2)} km\`;

        pin.appendChild(av);
        pin.appendChild(tip);
        layer.appendChild(pin);
      });
    }

    function renderFallback(users, radius_km) {
      const fb = document.getElementById('fallback');
      fb.style.display = 'block';
      fb.innerHTML = \`<strong>\${users.length} user(s) within \${radius_km} km</strong><ul>\${users.map(u => \`<li>\${u.displayName || u.username} (@\${u.username})</li>\`).join('')}</ul>\`;
      document.getElementById('map-wrap').style.display = 'none';
    }

    function expand() {
      window.openai?.requestDisplayMode?.({ mode: 'fullscreen' });
      window.webplus?.requestDisplayMode?.({ mode: 'fullscreen' });
    }

    // MCP Apps bridge (JSON-RPC postMessage)
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent) return;
      const m = e.data;
      if (!m || m.jsonrpc !== '2.0') return;
      if (m.method === 'ui/notifications/tool-result') render(m.params?.structuredContent);
    }, { passive: true });

    // Apps SDK compat
    window.addEventListener('openai:set_globals', (e) => {
      render(e.detail?.globals?.toolOutput ?? window.openai?.toolOutput);
    }, { passive: true });

    const initial = window.openai?.toolOutput;
    if (initial) render(initial);
  </script>
</body>
</html>`;

type UserRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  lat: number;
  lng: number;
};

function mapUsers(data: UserRow[] | null) {
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    lat: r.lat,
    lng: r.lng,
  }));
}

const handler = createMcpHandler(
  (server) => {
    // Register the map widget HTML as an MCP resource
    server.registerResource(
      "nearby-map-widget",
      WIDGET_URI,
      {
        title: "Nearby Map Widget",
        description: "Interactive map showing nearby Peek & Poke users",
        mimeType: "text/html+skybridge",
      },
      async () => ({
        contents: [
          {
            uri: WIDGET_URI,
            mimeType: "text/html+skybridge",
            text: WIDGET_HTML,
            _meta: {
              "openai/outputTemplate": WIDGET_URI,
              "openai/widgetAccessible": true,
              ui: { csp: { resourceDomains: ["https://api.mapbox.com"] } },
            },
          },
        ],
      })
    );

    // Data tool — returns text + structuredContent, no widget
    server.registerTool(
      "nearby_users",
      {
        title: "Nearby Users",
        description:
          "Find Peek & Poke users near a location. Returns a list of nearby users. Use render_nearby_map instead if the user wants a visual map.",
        inputSchema: {
          radius_km: z
            .number()
            .min(0.1)
            .max(50)
            .optional()
            .default(5)
            .describe("Search radius in kilometres (default 5)"),
        },
      },
      async ({ radius_km }) => {
        const supabase = createServiceClient();
        const { data, error } = await supabase.rpc("mcp_nearby_users", {
          p_lat: TEST_LAT,
          p_lng: TEST_LNG,
          p_radius_km: radius_km,
        });

        if (error) {
          return {
            content: [{ type: "text", text: `Error fetching nearby users: ${error.message}` }],
            isError: true,
          };
        }

        const users = mapUsers(data as UserRow[]);

        return {
          content: [
            {
              type: "text",
              text:
                users.length > 0
                  ? `Found ${users.length} user(s) within ${radius_km}km of Varna: ${users.map((u) => u.username).join(", ")}`
                  : `No users found within ${radius_km}km of Varna.`,
            },
          ],
          structuredContent: {
            users,
            center: { lat: TEST_LAT, lng: TEST_LNG },
            radius_km,
          },
        };
      }
    );

    // Render tool — fetches data and returns the map widget
    server.registerTool(
      "render_nearby_map",
      {
        title: "Nearby Users Map",
        description:
          "Show an interactive map of nearby Peek & Poke users with avatar pins. Use this whenever the user asks to see nearby users on a map or visually.",
        inputSchema: {
          radius_km: z
            .number()
            .min(0.1)
            .max(50)
            .optional()
            .default(5)
            .describe("Search radius in kilometres (default 5)"),
        },
        _meta: {
          "openai/outputTemplate": WIDGET_URI,
          "openai/toolInvocation/invoking": "Loading nearby users map…",
          "openai/toolInvocation/invoked": "Map ready.",
          "openai/widgetAccessible": true,
        },
      },
      async ({ radius_km }) => {
        const supabase = createServiceClient();
        const { data, error } = await supabase.rpc("mcp_nearby_users", {
          p_lat: TEST_LAT,
          p_lng: TEST_LNG,
          p_radius_km: radius_km,
        });

        if (error) {
          return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
          };
        }

        const users = mapUsers(data as UserRow[]);

        return {
          content: [
            {
              type: "text",
              text:
                users.length > 0
                  ? `Showing map with ${users.length} user(s) within ${radius_km}km of Varna.`
                  : `No users found within ${radius_km}km of Varna.`,
            },
          ],
          structuredContent: {
            users,
            center: { lat: TEST_LAT, lng: TEST_LNG },
            radius_km,
          },
        };
      }
    );
  },
  {
    serverInfo: { name: "peek-poke", version: "0.1.0" },
  },
  {
    basePath: "/api",
    verboseLogs: process.env.NODE_ENV === "development",
  }
);

export { handler as GET, handler as POST, handler as DELETE };
