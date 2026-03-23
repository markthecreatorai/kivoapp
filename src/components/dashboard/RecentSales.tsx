import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { supabase } from "@/integrations/supabase/client";

interface Sale {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_avatar_url?: string;
  total_amount: number;
  currency: string;
  created_at: string;
  product?: {
    name: string;
  };
}

export function RecentSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    if (!currentWorkspace) return;

    const fetchRecentSales = async () => {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select(`
            *,
            products:product_id (name)
          `)
          .eq('workspace_id', currentWorkspace.id)
          .eq('status', 'PAID')
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        
        setSales(data || []);
      } catch (error) {
        console.error('Erro ao buscar vendas:', error);
        setSales([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentSales();

    // Configurar Realtime para atualizações em tempo real
    const channel = supabase
      .channel('recent-sales')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `workspace_id=eq.${currentWorkspace.id}`,
        },
        () => {
          fetchRecentSales();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentWorkspace]);

  const formatCurrency = (amount: number, currency: string = 'BRL') => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const formatRelativeTime = (date: string) => {
    const now = new Date();
    const saleDate = new Date(date);
    const diffInMinutes = Math.floor((now.getTime() - saleDate.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'agora';
    if (diffInMinutes < 60) return `há ${diffInMinutes} min`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `há ${diffInHours}h`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `há ${diffInDays}d`;
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Card className="bg-white border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Últimas Vendas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 animate-pulse">
                <div className="w-10 h-10 bg-muted rounded-full"></div>
                <div className="flex-1 space-y-1">
                  <div className="h-4 bg-muted rounded w-24"></div>
                  <div className="h-3 bg-muted rounded w-32"></div>
                </div>
                <div className="h-4 bg-muted rounded w-16"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (sales.length === 0) {
    return (
      <Card className="bg-white border border-border/50 shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Últimas Vendas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            
            <h3 className="text-lg font-medium mb-2">Nenhuma venda ainda</h3>
            <p className="text-muted-foreground mb-4">
              Compartilhe sua loja para fazer sua primeira venda
            </p>
            <Button>
              <ExternalLink className="w-4 h-4 mr-2" />
              Compartilhar Loja
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white border border-border/50 shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Últimas Vendas</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sales.map((sale) => (
            <div key={sale.id} className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={sale.customer_avatar_url} />
                <AvatarFallback className="bg-primary/10 text-primary font-medium">
                  {getInitials(sale.customer_name || sale.customer_email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">
                  {sale.customer_name || sale.customer_email.split('@')[0]}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {sale.product?.name || 'Produto'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">
                  {formatCurrency(sale.total_amount, sale.currency)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRelativeTime(sale.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}