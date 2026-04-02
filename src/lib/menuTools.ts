export interface MenuToolItem {
  id: string;
  title: string;
  url: string;
}

export const menuToolItems: MenuToolItem[] = [
  { id: "home", title: "Home", url: "/dashboard" },
  { id: "store", title: "Minha Loja", url: "/store" },
  { id: "circles", title: "Circles", url: "/circles" },
  { id: "earnings", title: "Renda", url: "/earnings" },
  { id: "analytics", title: "Analytics", url: "/analytics" },
  { id: "clients", title: "Clientes", url: "/clients" },
  { id: "appointments", title: "Agendamentos", url: "/appointments" },
  { id: "referrals", title: "Indicações", url: "/referrals" },
  { id: "coupons", title: "Cupons", url: "/coupons" },
  { id: "payment-logs", title: "Logs Pagamento", url: "/payment-logs" },
  { id: "leads", title: "Leads", url: "/leads" },
  { id: "email-flows", title: "Email Flows", url: "/email-flows" },
  { id: "email-campaigns", title: "Campanhas", url: "/email-campaigns" },
  { id: "affiliates", title: "Afiliados", url: "/affiliates" },
  { id: "fiscal", title: "Fiscal", url: "/fiscal" },
  { id: "settings", title: "Configurações", url: "/settings" },
];

export const menuToolsStorageKey = "kivo.sidebar.menu.tools.v1";

const defaultToolMap = Object.fromEntries(menuToolItems.map((item) => [item.id, true])) as Record<string, boolean>;

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
