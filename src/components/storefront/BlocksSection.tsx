import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  GripVertical,
  Eye,
  EyeOff,
  Pencil,
  Trash2,
  Link2,
  ShoppingBag,
  FileText,
  Video,
  Type,
  MessageCircle,
  Minus,
  Timer,
  ChevronDown,
} from "lucide-react";
import type { StorefrontBlock } from "@/pages/StorefrontEditor";

const BLOCK_TYPES = [
  { type: 'link', label: 'Link Externo', icon: Link2, description: 'URL com título e ícone' },
  { type: 'product', label: 'Card de Produto', icon: ShoppingBag, description: 'Exibir produto da loja' },
  { type: 'lead_form', label: 'Formulário de Lead', icon: FileText, description: 'Capturar emails' },
  { type: 'video', label: 'Embed de Vídeo', icon: Video, description: 'YouTube ou Vimeo' },
  { type: 'text', label: 'Texto/Heading', icon: Type, description: 'Título ou parágrafo' },
  { type: 'whatsapp', label: 'Botão WhatsApp', icon: MessageCircle, description: 'Link direto' },
  { type: 'divider', label: 'Separador', icon: Minus, description: 'Linha divisória' },
  { type: 'countdown', label: 'Countdown Timer', icon: Timer, description: 'Contagem regressiva' },
];

const getBlockIcon = (type: string) => {
  const blockType = BLOCK_TYPES.find(b => b.type === type);
  return blockType?.icon || Link2;
};

const getBlockLabel = (type: string) => {
  const blockType = BLOCK_TYPES.find(b => b.type === type);
  return blockType?.label || 'Bloco';
};

interface SortableBlockItemProps {
  block: StorefrontBlock;
  onToggleVisibility: (id: string, visible: boolean) => void;
  onEdit: (block: StorefrontBlock) => void;
  onDelete: (id: string) => void;
}

function SortableBlockItem({ block, onToggleVisibility, onEdit, onDelete }: SortableBlockItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = getBlockIcon(block.type);
  const config = block.config as Record<string, string>;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 bg-card border rounded-lg ${
        !block.is_visible ? 'opacity-50' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {config.title || config.label || getBlockLabel(block.type)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onToggleVisibility(block.id, !block.is_visible)}
        >
          {block.is_visible ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(block)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(block.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface BlocksSectionProps {
  storefrontId: string;
  blocks: StorefrontBlock[];
  onBlocksChange: () => void;
}

export function BlocksSection({ storefrontId, blocks, onBlocksChange }: BlocksSectionProps) {
  const queryClient = useQueryClient();
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<StorefrontBlock | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [blockConfig, setBlockConfig] = useState<Record<string, unknown>>({});
  const [localBlocks, setLocalBlocks] = useState<StorefrontBlock[]>(blocks);

  useEffect(() => {
    setLocalBlocks(blocks);
  }, [blocks]);

  // Fetch products for product card selection
  const { data: products = [] } = useQuery({
    queryKey: ['products-for-blocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, thumbnail_url')
        .eq('status', 'PUBLISHED')
        .is('deleted_at', null)
        .limit(50);
      
      if (error) throw error;
      return data;
    }
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const updatePositionsMutation = useMutation({
    mutationFn: async (reorderedBlocks: StorefrontBlock[]) => {
      const updates = reorderedBlocks.map((block, index) => ({
        id: block.id,
        position: index
      }));

      for (const update of updates) {
        await supabase
          .from('storefront_blocks')
          .update({ position: update.position })
          .eq('id', update.id);
      }
    },
    onSuccess: () => {
      onBlocksChange();
    }
  });

  const addBlockMutation = useMutation({
    mutationFn: async ({ type, config }: { type: string; config: Record<string, unknown> }) => {
      const maxPosition = Math.max(0, ...blocks.map(b => b.position));
      const { error } = await supabase
        .from('storefront_blocks')
        .insert([{
          storefront_id: storefrontId,
          type,
          position: maxPosition + 1,
          config: config as any
        }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Bloco adicionado!');
      setAddModalOpen(false);
      setBlockConfig({});
      onBlocksChange();
    },
    onError: () => {
      toast.error('Erro ao adicionar bloco');
    }
  });

  const updateBlockMutation = useMutation({
    mutationFn: async ({ id, config }: { id: string; config: Record<string, unknown> }) => {
      const { error } = await supabase
        .from('storefront_blocks')
        .update({ config: config as any })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Bloco atualizado!');
      setEditingBlock(null);
      onBlocksChange();
    }
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      const { error } = await supabase
        .from('storefront_blocks')
        .update({ is_visible: visible })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      onBlocksChange();
    }
  });

  const deleteBlockMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('storefront_blocks')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Bloco excluído');
      setDeleteId(null);
      onBlocksChange();
    }
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localBlocks.findIndex(b => b.id === active.id);
    const newIndex = localBlocks.findIndex(b => b.id === over.id);
    const reordered = arrayMove(localBlocks, oldIndex, newIndex);
    
    // Atualização otimista para o dnd-kit não piscar/inativar
    setLocalBlocks(reordered);
    updatePositionsMutation.mutate(reordered);
  };

  const handleAddBlock = (type: string) => {
    let defaultConfig: Record<string, unknown> = {};
    
    switch (type) {
      case 'link':
        defaultConfig = { title: 'Meu Link', url: '', icon: 'link' };
        break;
      case 'product':
        defaultConfig = { product_id: '' };
        break;
      case 'lead_form':
        defaultConfig = { title: 'Baixe grátis', button_text: 'Quero!', fields: ['email'] };
        break;
      case 'video':
        defaultConfig = { url: '', title: '' };
        break;
      case 'text':
        defaultConfig = { content: '', variant: 'paragraph' };
        break;
      case 'whatsapp':
        defaultConfig = { phone: '', message: '' };
        break;
      case 'divider':
        defaultConfig = { style: 'line' };
        break;
      case 'countdown':
        defaultConfig = { target_date: '', label: 'Oferta termina em' };
        break;
    }

    addBlockMutation.mutate({ type, config: defaultConfig });
  };

  const renderBlockEditor = (block: StorefrontBlock) => {
    const config = (block.config || {}) as Record<string, unknown>;

    switch (block.type) {
      case 'link':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={(config.title as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={(config.url as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, url: e.target.value })}
                placeholder="https://..."
              />
            </div>
          </div>
        );

      case 'product':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Selecionar Produto</Label>
              <Select
                value={(config.product_id as string) || ''}
                onValueChange={(value) => setBlockConfig({ ...config, product_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um produto" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case 'lead_form':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={(config.title as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto do Botão</Label>
              <Input
                value={(config.button_text as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, button_text: e.target.value })}
              />
            </div>
          </div>
        );

      case 'video':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>URL do Vídeo (YouTube/Vimeo)</Label>
              <Input
                value={(config.url as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, url: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
          </div>
        );

      case 'text':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={(config.variant as string) || 'paragraph'}
                onValueChange={(value) => setBlockConfig({ ...config, variant: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="heading">Título</SelectItem>
                  <SelectItem value="paragraph">Parágrafo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                value={(config.content as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, content: e.target.value })}
                rows={3}
              />
            </div>
          </div>
        );

      case 'whatsapp':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Número (com DDD)</Label>
              <Input
                value={(config.phone as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, phone: e.target.value })}
                placeholder="5511999999999"
              />
            </div>
            <div className="space-y-2">
              <Label>Mensagem pré-definida</Label>
              <Textarea
                value={(config.message as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, message: e.target.value })}
                placeholder="Olá! Vi seu perfil e gostaria de..."
              />
            </div>
          </div>
        );

      case 'countdown':
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data alvo</Label>
              <Input
                type="datetime-local"
                value={(config.target_date as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, target_date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Label</Label>
              <Input
                value={(config.label as string) || ''}
                onChange={(e) => setBlockConfig({ ...config, label: e.target.value })}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogTrigger asChild>
          <Button className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Bloco
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Bloco</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {BLOCK_TYPES.map(({ type, label, icon: Icon, description }) => (
              <button
                key={type}
                onClick={() => handleAddBlock(type)}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted transition-colors text-left"
              >
                <Icon className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {localBlocks.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>Nenhum bloco ainda</p>
          <p className="text-sm">Adicione blocos para personalizar sua página</p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={localBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {localBlocks.map((block) => (
                <SortableBlockItem
                  key={block.id}
                  block={block}
                  onToggleVisibility={(id, visible) => 
                    toggleVisibilityMutation.mutate({ id, visible })
                  }
                  onEdit={(b) => {
                    setEditingBlock(b);
                    setBlockConfig(b.config);
                  }}
                  onDelete={setDeleteId}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Edit Block Dialog */}
      <Dialog open={!!editingBlock} onOpenChange={(open) => !open && setEditingBlock(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar {editingBlock && getBlockLabel(editingBlock.type)}</DialogTitle>
          </DialogHeader>
          {editingBlock && renderBlockEditor(editingBlock)}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setEditingBlock(null)}>
              Cancelar
            </Button>
            <Button 
              onClick={() => {
                if (editingBlock) {
                  updateBlockMutation.mutate({ 
                    id: editingBlock.id, 
                    config: blockConfig 
                  });
                }
              }}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir bloco?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteBlockMutation.mutate(deleteId)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
