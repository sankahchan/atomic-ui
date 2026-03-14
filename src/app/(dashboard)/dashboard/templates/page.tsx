'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SurfaceSkeleton } from '@/components/ui/surface-skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { formatBytes } from '@/lib/utils';
import { Edit2, FileText, Key, Loader2, Plus, Search, Server, Trash2 } from 'lucide-react';

function TemplateDialog({
  open,
  onOpenChange,
  template,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: any;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const isEditing = !!template;

  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    namePrefix: template?.namePrefix || '',
    dataLimitGB: template?.dataLimitGB?.toString() || '',
    dataLimitResetStrategy: template?.dataLimitResetStrategy || 'NEVER',
    expirationType: template?.expirationType || 'NEVER',
    durationDays: template?.durationDays?.toString() || '',
    method: template?.method || 'chacha20-ietf-poly1305',
    notes: template?.notes || '',
    serverId: template?.serverId || 'unassigned',
  });

  const { data: servers } = trpc.servers.list.useQuery();

  const createMutation = trpc.templates.create.useMutation({
    onSuccess: () => {
      toast({ title: 'Template created', description: 'Template has been created successfully.' });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) =>
      toast({ title: 'Failed to create', description: err.message, variant: 'destructive' }),
  });

  const updateMutation = trpc.templates.update.useMutation({
    onSuccess: () => {
      toast({ title: 'Template updated', description: 'Template has been updated successfully.' });
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) =>
      toast({ title: 'Failed to update', description: err.message, variant: 'destructive' }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      name: formData.name,
      description: formData.description || undefined,
      namePrefix: formData.namePrefix || undefined,
      dataLimitGB: formData.dataLimitGB ? parseFloat(formData.dataLimitGB) : undefined,
      dataLimitResetStrategy: formData.dataLimitResetStrategy,
      expirationType: formData.expirationType,
      durationDays: formData.durationDays ? parseInt(formData.durationDays, 10) : undefined,
      method: formData.method,
      notes: formData.notes || undefined,
      serverId: formData.serverId === 'unassigned' ? null : formData.serverId,
    };

    if (isEditing) {
      updateMutation.mutate({ id: template.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Template' : 'Create Template'}</DialogTitle>
          <DialogDescription>
            Define reusable settings for quickly creating access keys.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              placeholder="e.g. Standard 30 Day Plan"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Internal description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="namePrefix">Key Name Prefix</Label>
              <Input
                id="namePrefix"
                placeholder="e.g. user_"
                value={formData.namePrefix}
                onChange={(e) => setFormData({ ...formData, namePrefix: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Default Server</Label>
              <Select value={formData.serverId} onValueChange={(val) => setFormData({ ...formData, serverId: val })}>
                <SelectTrigger>
                  <SelectValue placeholder="No default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">No default server</SelectItem>
                  {servers?.map((server) => (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataLimit">Data Limit (GB)</Label>
            <Input
              id="dataLimit"
              type="number"
              step="0.1"
              placeholder="Leave empty for unlimited"
              value={formData.dataLimitGB}
              onChange={(e) => setFormData({ ...formData, dataLimitGB: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Expiration Type</Label>
            <Select
              value={formData.expirationType}
              onValueChange={(val) => setFormData({ ...formData, expirationType: val })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NEVER">Never Expires</SelectItem>
                <SelectItem value="DURATION_FROM_CREATION">Duration (from creation)</SelectItem>
                <SelectItem value="START_ON_FIRST_USE">Duration (from first use)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.expirationType !== 'NEVER' ? (
            <div className="space-y-2">
              <Label htmlFor="duration">Duration (Days)</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                placeholder="30"
                value={formData.durationDays}
                onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="notes">Default Notes</Label>
            <Input
              id="notes"
              placeholder="Added to keys created with this template"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing ? 'Save Changes' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function TemplatesPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState('');

  const { data: templates, isLoading, refetch } = trpc.templates.list.useQuery();
  const templateList = useMemo(() => templates ?? [], [templates]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templateList;
    return templateList.filter((template) =>
      [template.name, template.description, template.server?.name]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query))
    );
  }, [search, templateList]);

  const templatesWithLimits = templateList.filter((template) => template.dataLimitBytes).length;
  const templatesWithExpiration = templateList.filter((template) => template.expirationType !== 'NEVER').length;
  const defaultServers = new Set(templateList.map((template) => template.server?.id).filter(Boolean)).size;

  const deleteMutation = trpc.templates.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Template deleted', description: 'The template has been removed.' });
      setDeletingTemplateId(null);
      refetch();
    },
    onError: (err) => {
      toast({ title: 'Failed to delete', description: err.message, variant: 'destructive' });
      setDeletingTemplateId(null);
    },
  });

  const handleDelete = (id: string) => {
    const template = templateList.find((item) => item.id === id);
    setTemplateToDelete({ id, name: template?.name || 'this template' });
  };

  return (
    <div className="space-y-6">
      <section className="ops-showcase">
        <div className="ops-showcase-grid">
          <div className="space-y-5 self-start">
            <Badge
              variant="outline"
              className="ops-pill w-fit border-primary/25 bg-primary/10 text-primary dark:border-cyan-400/18 dark:bg-cyan-400/10 dark:text-cyan-200"
            >
              <FileText className="mr-2 h-3.5 w-3.5" />
              Template Library
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                Key templates
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Build reusable key presets for common quotas, expiry windows, and server defaults so your create flow stays fast and consistent.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Templates</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{templateList.length}</p>
                <p className="mt-2 text-sm text-muted-foreground">Saved creation presets.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Data-capped</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{templatesWithLimits}</p>
                <p className="mt-2 text-sm text-muted-foreground">Templates with built-in quotas.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Expiring</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{templatesWithExpiration}</p>
                <p className="mt-2 text-sm text-muted-foreground">Templates that include expiry rules.</p>
              </div>
              <div className="ops-kpi-tile">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Default servers</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight">{defaultServers}</p>
                <p className="mt-2 text-sm text-muted-foreground">Server defaults applied by template.</p>
              </div>
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Template controls</p>
                <h2 className="text-xl font-semibold">Command rail</h2>
                <p className="text-sm text-muted-foreground">
                  Create a new preset, then jump directly into key creation or review the inventory that depends on these defaults.
                </p>
              </div>

              <Button className="h-11 w-full rounded-full" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create template
              </Button>

              <div className="space-y-2">
                <Link href="/dashboard/keys" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Key className="h-4 w-4 text-primary" />
                    Open access keys
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Link href="/dashboard/servers" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Server className="h-4 w-4 text-primary" />
                    Review server defaults
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Template note</p>
                <h2 className="text-xl font-semibold">Preset coverage</h2>
              </div>
              <div className="ops-detail-card space-y-2">
                <p className="text-sm text-muted-foreground">
                  Templates keep your quota, expiry, and server assignment choices consistent when the same package or user tier is created repeatedly.
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Reusable</p>
                    <p className="mt-2 text-sm font-medium">One-click during key creation</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Scoped</p>
                    <p className="mt-2 text-sm font-medium">Optional server and quota defaults</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Card className="ops-panel">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="flex items-center gap-2 text-xl">
            <FileText className="h-5 w-5 text-primary" />
            Template inventory
          </CardTitle>
          <CardDescription>
            Search templates by name, description, or default server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="ops-filter-bar grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="template-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="template-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search templates, descriptions, or servers"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="ops-table-meta">{filteredTemplates.length} templates</div>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <SurfaceSkeleton key={i} className="min-h-[224px]" lines={5} />
              ))}
            </div>
          ) : filteredTemplates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={templateList.length === 0 ? 'No templates found' : 'No templates match the current search'}
              description={
                templateList.length === 0
                  ? 'Create a template to standardize your key creation process.'
                  : 'Try a different name, description, or server query.'
              }
              action={
                templateList.length === 0 ? (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create first template
                  </Button>
                ) : null
              }
              className="min-h-[240px]"
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((template) => (
                <Card
                  key={template.id}
                  className="ops-detail-card group h-full p-0 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 dark:hover:border-cyan-300/22"
                >
                  <CardHeader className="space-y-3 px-5 pb-0 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <CardTitle className="line-clamp-1 text-lg" title={template.name}>
                          {template.name}
                        </CardTitle>
                        <CardDescription className="line-clamp-2">
                          {template.description || 'No description'}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTemplate(template)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(template.id)}
                          disabled={deleteMutation.isPending && deletingTemplateId === template.id}
                        >
                          {deleteMutation.isPending && deletingTemplateId === template.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 px-5 pb-5 pt-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Data limit</p>
                        <p className="mt-2 text-sm font-medium">
                          {template.dataLimitBytes ? formatBytes(template.dataLimitBytes) : 'Unlimited'}
                        </p>
                      </div>
                      <div className="ops-mini-tile">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Expiration</p>
                        <p className="mt-2 text-sm font-medium">
                          {template.expirationType === 'NEVER' ? 'Never' : `${template.durationDays} days`}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {template.expirationType === 'START_ON_FIRST_USE'
                            ? 'Starts on first use'
                            : template.expirationType === 'NEVER'
                              ? 'No expiry applied'
                              : 'Fixed duration from creation'}
                        </p>
                      </div>
                    </div>

                    <div className="ops-mini-tile">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Default server</p>
                          <p className="mt-2 text-sm font-medium">{template.server?.name || 'No default server'}</p>
                        </div>
                        {template.server?.name ? <Badge variant="outline">Assigned</Badge> : null}
                      </div>
                    </div>

                    <div className="ops-mobile-action-bar">
                      <Button variant="secondary" className="w-full sm:flex-1" asChild>
                        <Link href={`/dashboard/keys?action=create&template=${template.id}`}>
                          <Plus className="mr-2 h-4 w-4" />
                          Use template
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <TemplateDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} />

      {editingTemplate ? (
        <TemplateDialog
          open={!!editingTemplate}
          onOpenChange={(open) => {
            if (!open) {
              setEditingTemplate(null);
            }
          }}
          template={editingTemplate}
          onSuccess={() => refetch()}
        />
      ) : null}

      <ConfirmationDialog
        open={!!templateToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setTemplateToDelete(null);
          }
        }}
        title="Delete template"
        description={
          templateToDelete
            ? `Are you sure you want to delete "${templateToDelete.name}"?`
            : ''
        }
        confirmLabel="Delete template"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!templateToDelete) return;
          setDeletingTemplateId(templateToDelete.id);
          deleteMutation.mutate({ id: templateToDelete.id });
        }}
      />
    </div>
  );
}
