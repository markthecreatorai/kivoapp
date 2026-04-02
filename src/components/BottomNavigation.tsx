import { Home, DollarSign, Store, MessagesSquare, MoreHorizontal } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

const navigationItems = [
  { title: "Home", url: "/dashboard", icon: Home },
  { title: "Renda", url: "/earnings", icon: DollarSign, hasNotifications: false },
  { title: "Minha Loja", url: "/store", icon: Store },
  { title: "Circles", url: "/circles", icon: MessagesSquare },
  { title: "Ver mais", url: "/menu-tools", icon: MoreHorizontal },
];

export function BottomNavigation() {
  const location = useLocation();
  const currentPath = location.pathname;

  const isActive = (path: string) => currentPath === path;

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border z-50 safe-area-pb">
      <div className="flex items-center justify-around px-1 py-2">
        {navigationItems.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end
            className="relative flex flex-col items-center justify-center px-2 py-2 rounded-lg text-muted-foreground hover:text-primary transition-all duration-200 min-w-0 flex-1"
            activeClassName="text-primary font-medium bg-primary/5"
          >
            <div className="relative">
              <item.icon className="h-5 w-5 mb-1" />
              {item.hasNotifications && (
                <Badge className="absolute -top-1 -right-1 h-2 w-2 p-0 bg-primary border-0 rounded-full">
                  <span className="sr-only">Nova notificação</span>
                </Badge>
              )}
            </div>
            <span className="text-xs truncate max-w-12">{item.title}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}