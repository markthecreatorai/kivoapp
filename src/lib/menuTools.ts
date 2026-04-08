export interface MenuToolItem {
  id: string;
  title: string;
  url: string;
  description: string;
  icon: string; // lucide icon name
}

/** Always visible in sidebar – cannot be toggled off */
export const coreItems: MenuToolItem[] = [
  { id: "home", title: "Home", url: "/dashboard", description: "", icon: "Home" },
  { id: "store", title: "Minha Loja", url: "/store", description: "", icon: "Store" },
  { id: "circles", title: "Circles", url: "/circles", description: "", icon: "MessagesSquare" },
  { id: "earnings", title: "Vendas", url: "/earnings", description: "", icon: "DollarSign" },
  { id: "analytics", title: "Relatórios", url: "/analytics", description: "", icon: "BarChart3" },
  { id: "clients", title: "Clientes", url: "/clients", description: "", icon: "Heart" },
  { id: "calendar", title: "Calendar", url: "/appointments", description: "", icon: "CalendarCheck" },
  { id: "autodm", title: "AutoDM", url: "/autodm", description: "", icon: "Zap" },
  { id: "referrals-kivo", title: "Afiliados Kivo", url: "/referrals", description: "", icon: "Users" },
];

/** Toggleable items shown in the "Mais" page */
export const optionalItems: MenuToolItem[] = [
  
  { id: "coupons", title: "Cupons", url: "/coupons", description: "Crie cupons de desconto!", icon: "Tag" },
  { id: "leads", title: "Leads", url: "/leads", description: "Capture e gerencie leads!", icon: "UserCheck" },
  { id: "email-campaigns", title: "Emails", url: "/email-campaigns", description: "Campanhas e automações de email!", icon: "Mail" },
  { id: "affiliates", title: "Afiliados", url: "/affiliates", description: "Gerencie seus afiliados!", icon: "Users" },
  { id: "fiscal", title: "Fiscal", url: "/fiscal", description: "Emita notas fiscais!", icon: "Receipt" },
  { id: "payment-logs", title: "Logs Pagamento", url: "/payment-logs", description: "Acompanhe logs de pagamento!", icon: "FileText" },
];

/** Combined list for backward compat */
export const menuToolItems: MenuToolItem[] = [...coreItems, ...optionalItems];

export const menuToolsStorageKey = "kivo.sidebar.menu.tools.v1";

const defaultToolMap = Object.fromEntries(optionalItems.map((item) => [item.id, false])) as Record<string, boolean>;

export function getMenuToolsState(): Record<string, boolean> {
  if (typeof window === "undefined") return defaultToolMap;

  const raw = window.localStorage.getItem(menuToolsStorageKey);
  if (!raw) return defaultToolMap;

  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return { ...defaultToolMap, ...parsed };
  } catch {
    return defaultToolMap;
  }
}

export function setMenuToolsState(next: Record<string, boolean>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(menuToolsStorageKey, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("kivo:menu-tools-updated"));
}
