import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Download, Image as ImageIcon, File, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface Attachment {
  id: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

/* ── Helpers ── */

function isImage(mime: string) {
  return mime.startsWith("image/");
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mime: string) {
  if (mime.includes("pdf")) return <FileText className="h-4 w-4 text-destructive" />;
  if (mime.includes("zip") || mime.includes("rar") || mime.includes("compressed"))
    return <File className="h-4 w-4 text-muted-foreground" />;
  if (mime.includes("doc") || mime.includes("word"))
    return <FileText className="h-4 w-4 text-primary" />;
  return <File className="h-4 w-4 text-muted-foreground" />;
}

/* ── Display component (for PostCard / PostDetailModal) ── */

interface PostAttachmentsDisplayProps {
  attachments: Attachment[];
  compact?: boolean;
}

export function PostAttachmentsDisplay({ attachments, compact }: PostAttachmentsDisplayProps) {
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!attachments?.length) return null;

  const imageAttachments = attachments.filter((a) => isImage(a.mime_type));
  const fileAttachments = attachments.filter((a) => !isImage(a.mime_type));

  const handleDownload = async (att: Attachment) => {
    setDownloading(att.id);
    try {
      const { data, error } = await supabase.storage
        .from("community-post-attachments")
        .createSignedUrl(att.file_path, 300); // 5 min
      if (error) throw error;
      window.open(data.signedUrl, "_blank");
    } catch (e: any) {
      toast.error("Erro ao baixar arquivo");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-2">
      {/* Image thumbnails */}
      {imageAttachments.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {imageAttachments.map((att) => (
            <ImageThumb key={att.id} attachment={att} compact={compact} />
          ))}
        </div>
      )}

      {/* File list */}
      {fileAttachments.length > 0 && (
        <div className="space-y-1">
          {fileAttachments.map((att) => (
            <button
              key={att.id}
              onClick={(e) => { e.stopPropagation(); handleDownload(att); }}
              className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors group"
            >
              {getFileIcon(att.mime_type)}
              <span className="flex-1 text-sm text-foreground truncate">{att.file_name}</span>
              <span className="text-xs text-muted-foreground">{formatSize(att.size_bytes)}</span>
              {downloading === att.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Download className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Image thumbnail with signed URL ── */

function ImageThumb({ attachment, compact }: { attachment: Attachment; compact?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(false);

  // Load signed URL on mount
  useState(() => {
    supabase.storage
      .from("community-post-attachments")
      .createSignedUrl(attachment.file_path, 3600)
      .then(({ data }) => {
        if (data) setUrl(data.signedUrl);
        setLoading(false);
      });
  });

  const size = compact ? "h-16 w-16" : "h-24 w-24";

  return (
    <>
      <div
        className={cn("rounded-lg overflow-hidden bg-muted cursor-pointer relative", size)}
        onClick={(e) => { e.stopPropagation(); if (url) setLightbox(true); }}
      >
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : url ? (
          <img src={url} alt={attachment.file_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Simple lightbox */}
      {lightbox && url && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(false)}
        >
          <img src={url} alt={attachment.file_name} className="max-w-full max-h-full object-contain rounded-lg" />
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightbox(false)}>
            <X className="h-6 w-6" />
          </button>
        </div>
      )}
    </>
  );
}

/* ── Composer preview (editable, with remove button) ── */

interface AttachmentPreviewProps {
  files: PendingAttachment[];
  onRemove: (index: number) => void;
}

export interface PendingAttachment {
  file: File;
  previewUrl?: string; // for images only
}

export function AttachmentComposerPreview({ files, onRemove }: AttachmentPreviewProps) {
  if (!files.length) return null;

  return (
    <div className="space-y-1.5">
      {files.map((f, i) => (
        <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 group">
          {f.previewUrl ? (
            <img src={f.previewUrl} alt="" className="h-8 w-8 rounded object-cover" />
          ) : (
            getFileIcon(f.file.type)
          )}
          <span className="flex-1 text-sm text-foreground truncate">{f.file.name}</span>
          <span className="text-xs text-muted-foreground">{formatSize(f.file.size)}</span>
          <button
            onClick={() => onRemove(i)}
            className="h-5 w-5 rounded-full bg-destructive/10 text-destructive flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
