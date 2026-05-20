import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";

// Hardcoded test coordinates: central Varna, Bulgaria
const TEST_LAT = 43.2141;
const TEST_LNG = 27.9147;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "nearby_users",
      {
        title: "Nearby Users",
        description:
          "Find Peek & Poke users near a location. Currently uses a fixed test location in Varna, Bulgaria.",
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

        type UserRow = { user_id: string; username: string; display_name: string | null; avatar_url: string | null };
        const users = (data ?? [] as UserRow[]).map((r: UserRow) => ({
          userId: r.user_id,
          username: r.username,
          displayName: r.display_name,
          avatarUrl: r.avatar_url,
        }));

        return {
          content: [
            {
              type: "text",
              text:
                users.length > 0
                  ? `Found ${users.length} user(s) within ${radius_km}km of Varna: ${users.map((u: { username: string }) => u.username).join(", ")}`
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
