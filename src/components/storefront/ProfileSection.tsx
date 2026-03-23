import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Upload, 
  Instagram, 
  Youtube, 
  Twitter,
  Loader2
} from "lucide-react";
import type { StorefrontData } from "@/pages/StorefrontEditor";

// TikTok icon component
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

interface ProfileSectionProps {
  storefront: StorefrontData;
  onUpdate: (data: Partial<StorefrontData>) => void;
}

export function ProfileSection({ storefront, onUpdate }: ProfileSectionProps) {
  const [title, setTitle] = useState(storefront.title || '');
  const [bio, setBio] = useState(storefront.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(storefront.avatar_url || '');
  const [socialLinks, setSocialLinks] = useState<Record<string, string>>(
    storefront.social_links || {}
  );
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setTitle(storefront.title || '');
    setBio(storefront.bio || '');
    setAvatarUrl(storefront.avatar_url || '');
    setSocialLinks(storefront.social_links || {});
  }, [storefront]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB');
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${storefront.id}-avatar.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('assets')
        .getPublicUrl(fileName);

      setAvatarUrl(urlData.publicUrl);
      onUpdate({ 
        title, 
        bio, 
        avatar_url: urlData.publicUrl, 
        social_links: socialLinks 
      });
      toast.success('Avatar atualizado!');
    } catch (error) {
      toast.error('Erro ao fazer upload do avatar');
    } finally {
      setUploading(false);
    }
  };

  const handleFieldChange = (field: 'title' | 'bio', value: string) => {
    if (field === 'title') {
      setTitle(value);
    } else {
      setBio(value);
    }
    onUpdate({ 
      title: field === 'title' ? value : title, 
      bio: field === 'bio' ? value : bio, 
      avatar_url: avatarUrl, 
      social_links: socialLinks 
    });
  };

  const handleSocialChange = (platform: string, value: string) => {
    const newLinks = { ...socialLinks, [platform]: value };
    setSocialLinks(newLinks);
    onUpdate({ title, bio, avatar_url: avatarUrl, social_links: newLinks });
  };

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="space-y-2">
        <Label>Avatar</Label>
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="text-2xl">
              {title?.charAt(0)?.toUpperCase() || 'K'}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
              id="avatar-upload"
            />
            <Button 
              variant="outline" 
              size="sm" 
              asChild
              disabled={uploading}
            >
              <label htmlFor="avatar-upload" className="cursor-pointer">
                {uploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Enviar foto
              </label>
            </Button>
            <p className="text-xs text-muted-foreground mt-1">
              JPG, PNG até 5MB
            </p>
          </div>
        </div>
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="display-name">Nome de exibição</Label>
        <Input
          id="display-name"
          value={title}
          onChange={(e) => handleFieldChange('title', e.target.value)}
          placeholder="Seu nome ou marca"
        />
      </div>

      {/* Bio */}
      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => handleFieldChange('bio', e.target.value)}
          placeholder="Uma breve descrição sobre você..."
          rows={3}
          maxLength={150}
        />
        <p className="text-xs text-muted-foreground text-right">
          {bio.length}/150
        </p>
      </div>

      {/* Social Links */}
      <div className="space-y-4">
        <Label>Redes Sociais</Label>
        
        <div className="space-y-3">
          <div className="relative">
            <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={socialLinks.instagram || ''}
              onChange={(e) => handleSocialChange('instagram', e.target.value)}
              placeholder="instagram.com/seuuser"
              className="pl-10"
            />
          </div>

          <div className="relative">
            <TikTokIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={socialLinks.tiktok || ''}
              onChange={(e) => handleSocialChange('tiktok', e.target.value)}
              placeholder="tiktok.com/@seuuser"
              className="pl-10"
            />
          </div>

          <div className="relative">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={socialLinks.youtube || ''}
              onChange={(e) => handleSocialChange('youtube', e.target.value)}
              placeholder="youtube.com/@seucanal"
              className="pl-10"
            />
          </div>

          <div className="relative">
            <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={socialLinks.twitter || ''}
              onChange={(e) => handleSocialChange('twitter', e.target.value)}
              placeholder="twitter.com/seuuser"
              className="pl-10"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
