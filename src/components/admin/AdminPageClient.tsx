"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Shield, Coins } from "lucide-react";
import { AdminModerationTab } from "@/components/admin/tabs/AdminModerationTab";
import { AdminCoinsTab } from "@/components/admin/tabs/AdminCoinsTab";

export function AdminPageClient() {
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage photo moderation and map coins</p>
      </div>

      <Tabs defaultValue="moderation">
        <TabsList className="mb-6">
          <TabsTrigger value="moderation" className="gap-2">
            <Shield className="h-4 w-4" />
            Moderation
          </TabsTrigger>
          <TabsTrigger value="coins" className="gap-2">
            <Coins className="h-4 w-4" />
            Coins
          </TabsTrigger>
        </TabsList>

        <TabsContent value="moderation" className="mt-0">
          <AdminModerationTab />
        </TabsContent>

        <TabsContent value="coins" className="mt-0">
          <AdminCoinsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
