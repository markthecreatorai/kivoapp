import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { 
  ArrowLeft, 
  Check, 
  Loader2, 
  Copy, 
  ExternalLink,
  User,
  LayoutGrid,
  Palette
} from "lucide-react";
import { ProfileSection } from "@/components/storefront/ProfileSection";
import { BlocksSection } from "@/components/storefront/BlocksSection";
import { ThemeSection } from "@/components/storefront/ThemeSection";
import { StorefrontPreview } from "@/components/storefront/StorefrontPreview";

export interface StorefrontData {
  id: string;
  slug: string;
  title: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  social_links: Record<string, string>;
  is_published: boolean;
}

export interface StorefrontTheme {
  id?: string;
  storefront_id: string;
  template_key: string;
  primary_color: string;
  secondary_color: string;
  background_color: string;
  text_color: string;
  font_heading: string;
  font_body: string;
  button_style: string;
  custom_css?: string;
}

export interface StorefrontBlock {
  id: string;
  storefront_id: string;
  type: string;
  position: number;
  is_visible: boolean;
  config: Record<string, unknown>;
}

export default function StorefrontEditor() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [activeTab, setActiveTab] = useState('profile');

  // Fetch storefront
  const { data: storefront, isLoading: storefrontLoading } = useQuery({
    queryKey: ['storefront', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;
      const { data, error } = await supabase
        .from('storefronts')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .single();
      
      if (error) throw error;
      return {
        ...data,
        social_links: (data.social_links as Record<string, string>) || {}
      } as unknown as StorefrontData;
    },
    enabled: !!currentWorkspace?.id
  });

  // Fetch theme
  const { data: theme } = useQuery({
    queryKey: ['storefront-theme', storefront?.id],
    queryFn: async () => {
      if (!storefront?.id) return null;
      const { data, error } = await supabase
        .from('storefront_themes')
        .select('*')
        .eq('storefront_id', storefront.id)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      return data as StorefrontTheme | null;
    },
    enabled: !!storefront?.id
  });

  // Fetch blocks
  const { data: blocks = [] } = useQuery({
    queryKey: ['storefront-blocks', storefront?.id],
    queryFn: async () => {
      if (!storefront?.id) return [];
      const { data, error } = await supabase
        .from('storefront_blocks')
        .select('*')
        .eq('storefront_id', storefront.id)
        .order('position', { ascending: true });
      
      if (error) throw error;
      return data as StorefrontBlock[];
    },
    enabled: !!storefront?.id
  });

  // Save storefront mutation
  const saveStorefrontMutation = useMutation({
    mutationFn: async (data: Partial<StorefrontData>) => {
      if (!storefront?.id) throw new Error('No storefront');
      setSaveStatus('saving');
      const { error } = await supabase
        .from('storefronts')
        .update({
          title: data.title,
          bio: data.bio,
          avatar_url: data.avatar_url,
          banner_url: data.banner_url,
          social_links: data.social_links
        })
        .eq('id', storefront.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['storefront'] });
    },
    onError: () => {
      setSaveStatus('unsaved');
      toast.error('Erro ao salvar alterações');
    }
  });

  // Save theme mutation
  const saveThemeMutation = useMutation({
    mutationFn: async (data: Partial<StorefrontTheme>) => {
      if (!storefront?.id) throw new Error('No storefront');
      setSaveStatus('saving');
      
      if (theme?.id) {
        const { error } = await supabase
          .from('storefront_themes')
          .update(data)
          .eq('id', theme.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('storefront_themes')
          .insert({
            storefront_id: storefront.id,
            template_key: data.template_key || 'minimal',
            primary_color: data.primary_color || '#F9423A',
            secondary_color: data.secondary_color || '#1a1a1a',
            background_color: data.background_color || '#ffffff',
            text_color: data.text_color || '#1a1a1a',
            font_heading: data.font_heading || 'Inter',
            font_body: data.font_body || 'Inter',
            button_style: data.button_style || 'rounded'
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setSaveStatus('saved');
      queryClient.invalidateQueries({ queryKey: ['storefront-theme'] });
    },
    onError: () => {
      setSaveStatus('unsaved');
      toast.error('Erro ao salvar tema');
    }
  });

  // Debounced save
  const debouncedSave = useCallback((type: 'storefront' | 'theme', data: unknown) => {
    setSaveStatus('unsaved');
    const timeout = setTimeout(() => {
      if (type === 'storefront') {
        saveStorefrontMutation.mutate(data as Partial<StorefrontData>);
      } else {
        saveThemeMutation.mutate(data as Partial<StorefrontTheme>);
      }
    }, 2000);
    return () => clearTimeout(timeout);
  }, [saveStorefrontMutation, saveThemeMutation]);

  const getStorefrontUrl = () => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/${storefront?.slug}`;
  };

  const copyLink = () => {
    if (storefront?.slug) {
      navigator.clipboard.writeText(getStorefrontUrl());
      toast.success('Link copiado!');
    }
  };

  const openPreview = () => {
    if (storefront?.slug) {
      window.open(getStorefrontUrl(), '_blank');
    }
  };

  if (storefrontLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!storefront) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Storefront não encontrada</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Editor da Loja</span>
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Salvando...
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="h-3 w-3 text-green-500" />
                  Salvo
                </>
              )}
              {saveStatus === 'unsaved' && (
                <span className="text-amber-500">Não salvo</span>
              )}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="h-4 w-4 mr-2" />
            Copiar Link
          </Button>
          <Button variant="outline" size="sm" onClick={openPreview}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Abrir
          </Button>
          <Button 
            size="sm"
            disabled={saveStorefrontMutation.isPending}
            onClick={async () => {
              if (!storefront?.id) return;
              try {
                const { error } = await supabase
                  .from('storefronts')
                  .update({ is_published: true })
                  .eq('id', storefront.id);
                if (error) throw error;
                queryClient.invalidateQueries({ queryKey: ['storefront'] });
                toast.success('Storefront publicada com sucesso!');
              } catch {
                toast.error('Erro ao publicar storefront');
              }
            }}
          >
            {storefront?.is_published ? 'Publicada' : 'Publicar'}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Controls */}
        <div className="w-[400px] border-r flex flex-col shrink-0">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4 h-12">
              <TabsTrigger value="profile" className="gap-2">
                <User className="h-4 w-4" />
                Perfil
              </TabsTrigger>
              <TabsTrigger value="blocks" className="gap-2">
                <LayoutGrid className="h-4 w-4" />
                Blocos
              </TabsTrigger>
              <TabsTrigger value="theme" className="gap-2">
                <Palette className="h-4 w-4" />
                Tema
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1">
              <TabsContent value="profile" className="mt-0 p-4">
                <ProfileSection 
                  storefront={storefront}
                  onUpdate={(data) => debouncedSave('storefront', data)}
                />
              </TabsContent>
              
              <TabsContent value="blocks" className="mt-0 p-4">
                <BlocksSection 
                  storefrontId={storefront.id}
                  blocks={blocks}
                  onBlocksChange={() => {
                    queryClient.invalidateQueries({ queryKey: ['storefront-blocks'] });
                  }}
                />
              </TabsContent>
              
              <TabsContent value="theme" className="mt-0 p-4">
                <ThemeSection 
                  theme={theme}
                  storefrontId={storefront.id}
                  onUpdate={(data) => debouncedSave('theme', data)}
                />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        {/* Right Panel - Preview */}
        <div className="flex-1 bg-muted/30 flex items-center justify-center p-8 overflow-auto">
          <StorefrontPreview 
            storefront={storefront}
            theme={theme}
            blocks={blocks}
          />
        </div>
      </div>
    </div>
  );
}
