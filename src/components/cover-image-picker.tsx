'use client';

/**
 * CoverImagePicker Component
 *
 * A Notion-like cover image picker with tabs for:
 * - Gallery: Pre-defined gradients
 * - Upload: Drag & drop file upload
 * - Unsplash: Search and select photos
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
  Search,
  Loader2,
  X,
  ImageIcon,
  Palette,
  Camera,
  Check,
} from 'lucide-react';

// Pre-defined gradients (matching Notion style)
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
];

interface UnsplashPhoto {
  id: string;
  description: string | null;
  urls: {
    thumb: string;
    small: string;
    regular: string;
    full: string;
  };
  user: {
    name: string;
    username: string;
    link: string;
  };
  color: string;
}

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
  const [isDragging, setIsDragging] = useState(false);

  // Unsplash state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [unsplashPhotos, setUnsplashPhotos] = useState<UnsplashPhoto[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Selection state
  const [selectedGradient, setSelectedGradient] = useState<string | null>(
    currentCoverType === 'gradient' ? (currentCover ?? null) : null
  );

  // Handle gradient selection
  const handleGradientSelect = async (gradient: typeof GRADIENTS[0]) => {
    try {
      const response = await fetch(`/api/keys/${keyId}/cover`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          coverImageType: 'gradient',
          coverImage: gradient.value,
        }),
      });

      if (!response.ok) throw new Error('Failed to save gradient');

      setSelectedGradient(gradient.value);
      onCoverChange(gradient.value, 'gradient');
      toast({ title: 'Cover updated', description: `Set to ${gradient.name} gradient` });
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Failed to save cover', variant: 'destructive' });
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
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      onCoverChange(data.coverImage, 'upload');
      toast({ title: 'Cover uploaded successfully' });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Unknown error',
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

  // Handle Unsplash search
  const handleUnsplashSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setHasSearched(true);
    try {
      const response = await fetch(
        `/api/unsplash/search?query=${encodeURIComponent(searchQuery)}&per_page=20`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Search failed');
      }

      const data = await response.json();
      setUnsplashPhotos(data.photos);
    } catch (error) {
      toast({
        title: 'Search failed',
        description: error instanceof Error ? error.message : 'Could not search Unsplash',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Unsplash photo selection
  const handleUnsplashSelect = async (photo: UnsplashPhoto) => {
    try {
      const response = await fetch(`/api/keys/${keyId}/cover`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          coverImageType: 'unsplash',
          coverImage: photo.urls.regular,
        }),
      });

      if (!response.ok) throw new Error('Failed to save cover');

      onCoverChange(photo.urls.regular, 'unsplash');
      toast({
        title: 'Cover updated',
        description: `Photo by ${photo.user.name}`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Failed to save cover', variant: 'destructive' });
    }
  };

  // Handle remove cover
  const handleRemoveCover = async () => {
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
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span>Change cover</span>
            {(currentCover || currentCoverType) && (
              <Button variant="ghost" size="sm" onClick={handleRemoveCover}>
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
            <TabsTrigger value="unsplash" className="flex items-center gap-2">
              <Camera className="w-4 h-4" />
              Unsplash
            </TabsTrigger>
          </TabsList>

          {/* Gallery Tab - Gradients */}
          <TabsContent value="gallery" className="flex-1 overflow-auto mt-4">
            <p className="text-sm text-muted-foreground mb-4">Color & Gradient</p>
            <div className="grid grid-cols-4 gap-3">
              {GRADIENTS.map((gradient) => (
                <button
                  key={gradient.id}
                  onClick={() => handleGradientSelect(gradient)}
                  className={cn(
                    'relative aspect-[16/10] rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-primary',
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

          {/* Unsplash Tab */}
          <TabsContent value="unsplash" className="flex-1 overflow-hidden flex flex-col mt-4">
            <div className="flex gap-2 flex-shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search photos..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnsplashSearch()}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleUnsplashSearch} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </div>

            <div className="flex-1 overflow-auto mt-4">
              {isSearching ? (
                <div className="flex items-center justify-center h-48">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : unsplashPhotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-3">
                  {unsplashPhotos.map((photo) => (
                    <button
                      key={photo.id}
                      onClick={() => handleUnsplashSelect(photo)}
                      className="relative aspect-[16/10] rounded-lg overflow-hidden group"
                    >
                      <Image
                        src={photo.urls.small}
                        alt={photo.description || 'Unsplash photo'}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                        <p className="text-xs text-white p-2 opacity-0 group-hover:opacity-100 transition-opacity truncate w-full">
                          by {photo.user.name}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              ) : hasSearched ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <ImageIcon className="w-10 h-10 mb-2" />
                  <p>No photos found</p>
                  <p className="text-sm">Try a different search term</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <Camera className="w-10 h-10 mb-2" />
                  <p>Search for beautiful photos</p>
                  <p className="text-sm">Powered by Unsplash</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// Export gradient values for use in subscription page
export const COVER_GRADIENTS = GRADIENTS;
