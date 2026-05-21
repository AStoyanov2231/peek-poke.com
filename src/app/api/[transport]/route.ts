import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

const TEST_LAT = 43.2141;
const TEST_LNG = 27.9147;
const WIDGET_URI = "ui://widget/nearby-map.html";
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Full Mapbox GL JS widget — interactive pan/zoom, popups, radius circle, avatar pins.
const WIDGET_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.css" rel="stylesheet" />
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.4.0/mapbox-gl.js"><\/script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; display: flex; flex-direction: column; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

    #map-wrap { position: relative; flex: 1; min-height: 320px; }
    #map { position: absolute; inset: 0; }

    #loading {
      position: absolute; inset: 0; z-index: 20;
      display: flex; align-items: center; justify-content: center;
      background: #f5f5f5; font-size: 13px; color: #999;
      gap: 8px;
    }
    .spinner {
      width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid #ddd; border-top-color: #7c3aed;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Avatar marker */
    .m-wrap { cursor: pointer; }
    .m-av {
      width: 38px; height: 38px; border-radius: 50%;
      border: 2.5px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      background: #7c3aed; color: white; font-weight: 700; font-size: 15px;
      display: flex; align-items: center; justify-content: center; overflow: hidden;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }
    .m-wrap:hover .m-av {
      transform: scale(1.18);
      box-shadow: 0 4px 14px rgba(124,58,237,0.55);
    }
    .m-av img { width: 100%; height: 100%; object-fit: cover; }

    /* Center dot */
    .m-center {
      width: 12px; height: 12px; border-radius: 50%;
      background: #7c3aed; border: 2.5px solid white;
      box-shadow: 0 1px 5px rgba(0,0,0,0.4);
    }

    /* Popup */
    .mapboxgl-popup-content {
      border-radius: 10px !important; padding: 10px 14px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.13) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-width: 140px;
    }
    .mapboxgl-popup-tip { display: none; }
    .p-name { font-weight: 700; font-size: 14px; color: #111; }
    .p-user { font-size: 12px; color: #999; margin-top: 1px; }
    .p-dist { font-size: 11px; color: #7c3aed; font-weight: 600; margin-top: 5px; }

    /* Bottom bar */
    #bar {
      flex-shrink: 0; padding: 8px 14px; background: white;
      border-top: 1px solid #f0f0f0;
      display: flex; align-items: center; justify-content: space-between;
      font-size: 12px; color: #666;
    }
    #expand-btn {
      background: none; border: 1.5px solid #7c3aed; color: #7c3aed;
      border-radius: 6px; padding: 3px 10px; font-size: 11px;
      cursor: pointer; font-weight: 600; transition: background 0.12s;
    }
    #expand-btn:hover { background: #f3f0ff; }
  </style>
</head>
<body>
  <div id="map-wrap">
    <div id="loading"><div class="spinner"></div>Loading map…</div>
    <div id="map"></div>
  </div>
  <div id="bar">
    <span id="status">—</span>
    <button id="expand-btn" onclick="expand()">⛶ Expand</button>
  </div>

  <script>
    mapboxgl.accessToken = '${MAPBOX_TOKEN}';

    const DEFAULT = { lat: 43.2141, lng: 27.9147 };
    let map, markers = [];

    map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [DEFAULT.lng, DEFAULT.lat],
      zoom: 12,
      attributionControl: false,
    });
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      document.getElementById('loading').style.display = 'none';
      const initial = window.openai?.toolOutput;
      if (initial) renderData(initial);
    });

    function clearMap() {
      markers.forEach(m => m.remove());
      markers = [];
      ['radius-fill', 'radius-line'].forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
      if (map.getSource('radius')) map.removeSource('radius');
    }

    function radiusGeoJSON(lat, lng, km, steps = 64) {
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [Array.from({ length: steps + 1 }, (_, i) => {
            const a = (i / steps) * 2 * Math.PI;
            return [
              lng + (km / 6371) * Math.sin(a) / Math.cos(lat * Math.PI / 180) * (180 / Math.PI),
              lat + (km / 6371) * Math.cos(a) * (180 / Math.PI),
            ];
          })],
        },
      };
    }

    function haversine(lat1, lng1, lat2, lng2) {
      const R = 6371, dL = (lat2-lat1)*Math.PI/180, dN = (lng2-lng1)*Math.PI/180;
      const a = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dN/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function renderData(data) {
      if (!data) return;
      if (!map.loaded()) { map.once('load', () => renderData(data)); return; }

      const { users = [], center = DEFAULT, radius_km = 5 } = data;
      clearMap();

      // Radius circle
      map.addSource('radius', { type: 'geojson', data: radiusGeoJSON(center.lat, center.lng, radius_km) });
      map.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.07 } });
      map.addLayer({ id: 'radius-line', type: 'line', source: 'radius', paint: { 'line-color': '#7c3aed', 'line-width': 1.5, 'line-dasharray': [2, 2] } });

      // Center marker
      const centerEl = document.createElement('div');
      centerEl.className = 'm-center';
      markers.push(new mapboxgl.Marker({ element: centerEl }).setLngLat([center.lng, center.lat]).addTo(map));

      // User markers
      users.filter(u => u.lat && u.lng).forEach(u => {
        const name = u.displayName || u.username;
        const d = haversine(center.lat, center.lng, u.lat, u.lng);

        const wrap = document.createElement('div');
        wrap.className = 'm-wrap';
        const av = document.createElement('div');
        av.className = 'm-av';
        if (u.avatarUrl) {
          const img = document.createElement('img');
          img.src = u.avatarUrl;
          img.onerror = () => { img.remove(); av.textContent = name[0].toUpperCase(); };
          av.appendChild(img);
        } else {
          av.textContent = name[0].toUpperCase();
        }
        wrap.appendChild(av);

        const popup = new mapboxgl.Popup({ offset: 22, closeButton: false, maxWidth: '200px' })
          .setHTML(\`<div class="p-name">\${name}</div><div class="p-user">@\${u.username}</div><div class="p-dist">\${d.toFixed(2)} km away</div>\`);

        markers.push(
          new mapboxgl.Marker({ element: wrap }).setLngLat([u.lng, u.lat]).setPopup(popup).addTo(map)
        );
      });

      // Fit map to content
      const coords = [[center.lng, center.lat], ...users.filter(u => u.lat).map(u => [u.lng, u.lat])];
      if (coords.length > 1) {
        const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
        map.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 900 });
      } else {
        map.flyTo({ center: [center.lng, center.lat], zoom: 13, duration: 900 });
      }

      const n = users.length;
      document.getElementById('status').innerHTML = n > 0
        ? \`<strong>\${n}</strong> user\${n > 1 ? 's' : ''} within <strong>\${radius_km} km</strong>\`
        : \`No users within \${radius_km} km\`;
    }

    function expand() {
      window.openai?.requestDisplayMode?.({ mode: 'fullscreen' });
      window.webplus?.requestDisplayMode?.({ mode: 'fullscreen' });
    }

    // MCP Apps bridge
    window.addEventListener('message', (e) => {
      if (e.source !== window.parent) return;
      const m = e.data;
      if (!m || m.jsonrpc !== '2.0') return;
      if (m.method === 'ui/notifications/tool-result') renderData(m.params?.structuredContent);
    }, { passive: true });

    window.addEventListener('openai:set_globals', (e) => {
      renderData(e.detail?.globals?.toolOutput ?? window.openai?.toolOutput);
    }, { passive: true });
  <\/script>
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
              ui: {
                csp: {
                  connectDomains: ["https://events.mapbox.com", "https://api.mapbox.com"],
                  resourceDomains: ["https://api.mapbox.com"],
                },
              },
            },
          },
        ],
      })
    );

    server.registerTool(
      "nearby_users",
      {
        title: "Nearby Users",
        description:
          "Find Peek & Poke users near a location. Returns a list. Use render_nearby_map if the user wants a visual map.",
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
          structuredContent: { users, center: { lat: TEST_LAT, lng: TEST_LNG }, radius_km },
        };
      }
    );

    server.registerTool(
      "render_nearby_map",
      {
        title: "Nearby Users Map",
        description:
          "Show an interactive Mapbox map of nearby Peek & Poke users with avatar pins, radius circle, and click-to-inspect popups. Use this when the user wants to see nearby users visually on a map.",
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
          structuredContent: { users, center: { lat: TEST_LAT, lng: TEST_LNG }, radius_km },
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
