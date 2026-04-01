import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

import AdminDashboardTab from "./AdminDashboardTab";
import AdminInviteTab from "./AdminInviteTab";
import AdminGeneralTab from "./AdminGeneralTab";
import AdminPayoutsTab from "./AdminPayoutsTab";
import AdminPricingTab from "./AdminPricingTab";
import AdminAffiliatesTab from "./AdminAffiliatesTab";
import AdminPluginsTab from "./AdminPluginsTab";
import AdminCommunityTab from "./AdminCommunityTab";
import AdminDiscoveryTab from "./AdminDiscoveryTab";
import AdminBillingTab from "./AdminBillingTab";


interface Props {
  community: any;
  member: any;
  onClose: () => void;
}

type Section =
  | "dashboard"
  | "invite"
  | "general"
  | "payouts"
  | "pricing"
  | "affiliates"
  | "plugins"
  | "community"
  | "discovery"
  | "billing";

const NAV_ITEMS: { id: Section; label: string; disabled?: boolean }[] = [
  { id: "dashboard", label: "Painel" },
  { id: "invite", label: "Convites" },
  { id: "general", label: "Geral" },
  { id: "payouts", label: "Recebimentos" },
  { id: "pricing", label: "Preços" },
  { id: "affiliates", label: "Afiliados" },
  { id: "plugins", label: "Plugins", disabled: true },
  { id: "community", label: "Comunidade" },
  { id: "discovery", label: "Descoberta" },
  { id: "billing", label: "Cobrança" },
];

export default function CircleAdminModal({ community, member, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");

  const renderContent = () => {
    switch (activeSection) {
      case "dashboard":
        return <AdminDashboardTab community={community} />;
      case "invite":
        return <AdminInviteTab community={community} member={member} />;
      case "general":
        return <AdminGeneralTab community={community} />;
      case "payouts":
        return <AdminPayoutsTab community={community} />;
      case "pricing":
        return <AdminPricingTab community={community} />;
      case "affiliates":
        return <AdminAffiliatesTab community={community} />;
      case "plugins":
        return <AdminPluginsTab community={community} />;
      case "community":
        return <AdminCommunityTab community={community} />;
      case "discovery":
        return <AdminDiscoveryTab community={community} />;
      case "billing":
        return <AdminBillingTab community={community} />;
      default:
        return null;
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal */}
      <div
        className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl flex overflow-hidden"
        style={{ height: "min(90vh, 680px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Sidebar ─── */}
        <aside className="w-52 shrink-0 border-r border-gray-100 flex flex-col bg-white">
          {/* Community identity */}
          <div className="px-5 py-5 border-b border-gray-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-red-600 flex items-center justify-center text-white font-bold text-sm">
              {community.icon_url ? (
                <img
                  src={community.icon_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                (community.name?.[0] || "C").toUpperCase()
              )}
            </div>
            <span className="text-sm font-bold text-gray-900 truncate">
              {community.name || "Community"}
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => !item.disabled && setActiveSection(item.id)}
                disabled={item.disabled}
                className={cn(
                  "w-full text-left px-5 py-2.5 text-sm font-medium transition-colors flex items-center justify-between",
                  item.disabled
                    ? "text-gray-400 cursor-not-allowed"
                    : activeSection === item.id
                      ? "bg-yellow-100 text-gray-900 font-semibold"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                {item.label}
                {item.disabled && (
                  <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">
                    Em breve
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-100">
            <p className="text-[11px] text-gray-400">
              Powered by{" "}
              <span className="font-bold">
                <span className="text-gray-700">ki</span>
                <span className="text-yellow-500">vo</span>
              </span>
            </p>
          </div>
        </aside>

        {/* ─── Content ─── */}
        <main className="flex-1 overflow-y-auto">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            aria-label="Fechar"
          >
            <X className="h-4.5 w-4.5" />
          </button>

          {/* Section content */}
          <div className="px-8 py-7 min-h-full">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
