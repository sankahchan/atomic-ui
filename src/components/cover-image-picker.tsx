'use client';

/**
 * CoverImagePicker Component
 *
 * A Notion-like cover image picker with tabs for:
 * - Gallery: Pre-defined gradients and solid colors
 * - Upload: Drag & drop file upload
 * - Link: Paste any image URL from the web
 */

import { useState, useCallback, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Upload,
  Link as LinkIcon,
  Loader2,
  ImageIcon,
  Palette,
  Check,
  ExternalLink,
} from 'lucide-react';

// Pre-defined gradients
const GRADIENTS = [
  { id: 'gradient-coral', name: 'Coral', value: 'linear-gradient(135deg, #f97171 0%, #f4a58a 100%)' },
  { id: 'gradient-amber', name: 'Amber', value: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)' },
  { id: 'gradient-teal', name: 'Teal', value: 'linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)' },
  { id: 'gradient-cream', name: 'Cream', value: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' },
  { id: 'gradient-purple', name: 'Purple', value: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)' },
  { id: 'gradient-pink', name: 'Pink', value: 'linear-gradient(135deg, #ec4899 0%, #f472b6 100%)' },
  { id: 'gradient-sunset', name: 'Sunset', value: 'linear-gradient(135deg, #f97316 0%, #ef4444 100%)' },
  { id: 'gradient-ocean', name: 'Ocean', value: 'linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)' },
  { id: 'gradient-lavender', name: 'Lavender', value: 'linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)' },
  { id: 'gradient-sky', name: 'Sky', value: 'linear-gradient(135deg, #7dd3fc 0%, #38bdf8 100%)' },
  { id: 'gradient-mint', name: 'Mint', value: 'linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%)' },
  { id: 'gradient-rose', name: 'Rose', value: 'linear-gradient(135deg, #fda4af 0%, #fb7185 100%)' },
  { id: 'gradient-emerald', name: 'Emerald', value: 'linear-gradient(135deg, #10b981 0%, #059669 100%)' },
  { id: 'gradient-indigo', name: 'Indigo', value: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' },
  { id: 'gradient-slate', name: 'Slate', value: 'linear-gradient(135deg, #64748b 0%, #475569 100%)' },
  { id: 'gradient-warm', name: 'Warm', value: 'linear-gradient(135deg, #fcd34d 0%, #f97316 100%)' },
];

// Solid colors
const SOLID_COLORS = [
  { id: 'solid-red', name: 'Red', value: '#ef4444' },
  { id: 'solid-orange', name: 'Orange', value: '#f97316' },
  { id: 'solid-amber', name: 'Amber', value: '#f59e0b' },
  { id: 'solid-yellow', name: 'Yellow', value: '#eab308' },
  { id: 'solid-lime', name: 'Lime', value: '#84cc16' },
  { id: 'solid-green', name: 'Green', value: '#22c55e' },
  { id: 'solid-emerald', name: 'Emerald', value: '#10b981' },
  { id: 'solid-teal', name: 'Teal', value: '#14b8a6' },
  { id: 'solid-cyan', name: 'Cyan', value: '#06b6d4' },
  { id: 'solid-sky', name: 'Sky', value: '#0ea5e9' },
  { id: 'solid-blue', name: 'Blue', value: '#3b82f6' },
  { id: 'solid-indigo', name: 'Indigo', value: '#6366f1' },
  { id: 'solid-violet', name: 'Violet', value: '#8b5cf6' },
  { id: 'solid-purple', name: 'Purple', value: '#a855f7' },
  { id: 'solid-fuchsia', name: 'Fuchsia', value: '#d946ef' },
  { id: 'solid-pink', name: 'Pink', value: '#ec4899' },
  { id: 'solid-rose', name: 'Rose', value: '#f43f5e' },
  { id: 'solid-slate', name: 'Slate', value: '#64748b' },
  { id: 'solid-gray', name: 'Gray', value: '#6b7280' },
  { id: 'solid-zinc', name: 'Zinc', value: '#71717a' },
];

interface CoverImagePickerProps {
  keyId: string;
  currentCover?: string | null;
  currentCoverType?: string | null;
  onCoverChange: (coverImage: string | null, coverImageType: string | null) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoverImagePicker({
  keyId,
  currentCover,
  currentCoverType,
  onCoverChange,
  open,
  onOpenChange,
}: CoverImagePickerProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState('gallery');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Link tab state
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isValidatingUrl, setIsValidatingUrl] = useState(false);

  // Selection state
  const [selectedGradient, setSelectedGradient] = useState<string | null>(
    currentCoverType === 'gradient' ? (currentCover ?? null) : null
  );

  // Save cover to server
  const saveCover = async (coverImage: string, coverImageType: string) => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/keys/${keyId}/cover`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ coverImageType, coverImage }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save cover');
      }

      return true;
    } catch (error) {
      console.error('Save cover error:', error);
      toast({
        title: 'Failed to save cover',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Handle gradient/color selection
  const handleGradientSelect = async (value: string, name: string) => {
    const success = await saveCover(value, 'gradient');
    if (success) {
      setSelectedGradient(value);
      onCoverChange(value, 'gradient');
      toast({ title: 'Cover updated', description: `Set to ${name}` });
      onOpenChange(false);
    }
  };

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file type', description: 'Please upload an image', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum size is 5MB', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('keyId', keyId);

      const response = await fetch('/api/upload/cover', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      onCoverChange(data.coverImage, 'upload');
      toast({ title: 'Cover uploaded successfully' });
      onOpenChange(false);
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  }, [keyId, onCoverChange, onOpenChange, toast]);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  // Validate and preview image URL
  const validateImageUrl = useCallback(async (url: string) => {
    if (!url.trim()) {
      setImagePreview(null);
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      toast({ title: 'Invalid URL', description: 'Please enter a valid URL', variant: 'destructive' });
      return;
    }

    setIsValidatingUrl(true);
    setImagePreview(url);
    setIsValidatingUrl(false);
  }, [toast]);

  // Handle URL submission
  const handleUrlSubmit = async () => {
    if (!imageUrl.trim()) {
      toast({ title: 'Please enter an image URL', variant: 'destructive' });
      return;
    }

    const success = await saveCover(imageUrl, 'url');
    if (success) {
      onCoverChange(imageUrl, 'url');
      toast({ title: 'Cover updated' });
      setImageUrl('');
      setImagePreview(null);
      onOpenChange(false);
    }
  };

  // Handle remove cover
  const handleRemoveCover = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/keys/${keyId}/cover`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) throw new Error('Failed to remove cover');

      onCoverChange(null, null);
      setSelectedGradient(null);
      toast({ title: 'Cover removed' });
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Failed to remove cover', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Change cover</span>
            {(currentCover || currentCoverType) && (
              <Button variant="ghost" size="sm" onClick={handleRemoveCover} disabled={isSaving}>
                Remove
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3 flex-shrink-0">
            <TabsTrigger value="gallery" className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Gallery
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="link" className="flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Link
            </TabsTrigger>
          </TabsList>

          {/* Gallery Tab - Gradients & Colors */}
          <TabsContent value="gallery" className="flex-1 overflow-auto mt-4 space-y-6">
            {/* Gradients */}
            <div>
              <p className="text-sm text-muted-foreground mb-3">Gradients</p>
              <div className="grid grid-cols-4 gap-3">
                {GRADIENTS.map((gradient) => (
                  <button
                    key={gradient.id}
                    onClick={() => handleGradientSelect(gradient.value, gradient.name)}
                    disabled={isSaving}
                    className={cn(
                      'relative aspect-[16/10] rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-primary disabled:opacity-50',
                      selectedGradient === gradient.value && 'ring-2 ring-primary'
                    )}
                    style={{ background: gradient.value }}
                    title={gradient.name}
                  >
                    {selectedGradient === gradient.value && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Check className="w-6 h-6 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Solid Colors */}
            <div>
              <p className="text-sm text-muted-foreground mb-3">Solid Colors</p>
              <div className="grid grid-cols-5 gap-3">
                {SOLID_COLORS.map((color) => (
                  <button
                    key={color.id}
                    onClick={() => handleGradientSelect(color.value, color.name)}
                    disabled={isSaving}
                    className={cn(
                      'relative aspect-square rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-primary disabled:opacity-50',
                      selectedGradient === color.value && 'ring-2 ring-primary'
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  >
                    {selectedGradient === color.value && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Check className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="flex-1 overflow-auto mt-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <ImageIcon className="w-10 h-10 text-muted-foreground" />
                  <p className="font-medium">Click or drag to upload</p>
                  <p className="text-sm text-muted-foreground">
                    JPEG, PNG, WebP, or GIF (max 5MB)
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Link Tab - Paste any image URL */}
          <TabsContent value="link" className="flex-1 overflow-auto mt-4 space-y-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Paste an image URL from any website (Pexels, Pixabay, your own hosting, etc.)
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/image.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  onBlur={() => validateImageUrl(imageUrl)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                />
                <Button onClick={handleUrlSubmit} disabled={isSaving || !imageUrl.trim()}>
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                </Button>
              </div>
            </div>

            {/* Image Preview */}
            {imagePreview && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Preview:</p>
                <div className="relative aspect-[16/9] rounded-lg overflow-hidden bg-muted">
                  {isValidatingUrl ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Image
                      src={imagePreview}
                      alt="Preview"
                      fill
                      className="object-cover"
                      onError={() => {
                        setImagePreview(null);
                        toast({
                          title: 'Failed to load image',
                          description: 'Please check the URL and try again',
                          variant: 'destructive',
                        });
                      }}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Free image sources */}
            <div className="pt-4 border-t">
              <p className="text-sm font-medium mb-2">Free image sources:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <a
                  href="https://www.pexels.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Pexels
                </a>
                <a
                  href="https://pixabay.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Pixabay
                </a>
                <a
                  href="https://unsplash.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Unsplash
                </a>
                <a
                  href="https://www.freepik.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Freepik
                </a>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Export gradient values for use in subscription page
export const COVER_GRADIENTS = GRADIENTS;
