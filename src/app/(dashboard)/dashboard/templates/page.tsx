'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/hooks/use-toast';
import { FileText, Plus, Trash2, Edit2, Copy, Loader2, ArrowRight } from 'lucide-react';
import { formatBytes } from '@/lib/utils';

/**
 * Template Dialog
 * 
 * Used for creating and editing templates.
 */
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
        onError: (err) => toast({ title: 'Failed to create', description: err.message, variant: 'destructive' }),
    });

    const updateMutation = trpc.templates.update.useMutation({
        onSuccess: () => {
            toast({ title: 'Template updated', description: 'Template has been updated successfully.' });
            onSuccess();
            onOpenChange(false);
        },
        onError: (err) => toast({ title: 'Failed to update', description: err.message, variant: 'destructive' }),
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
            durationDays: formData.durationDays ? parseInt(formData.durationDays) : undefined,
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
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{isEditing ? 'Edit Template' : 'Create Template'}</DialogTitle>
                    <DialogDescription>
                        Define common settings for quickly creating access keys.
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
                            <Select
                                value={formData.serverId}
                                onValueChange={(val) => setFormData({ ...formData, serverId: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="No default" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="unassigned">No default server</SelectItem>
                                    {servers?.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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

                    {(formData.expirationType !== 'NEVER') && (
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
                    )}

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
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
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

    const { data: templates, isLoading, refetch } = trpc.templates.list.useQuery();

    const deleteMutation = trpc.templates.delete.useMutation({
        onSuccess: () => {
            toast({ title: 'Template deleted', description: 'The template has been removed.' });
            refetch();
        }
    });

    const handleDelete = (id: string) => {
        if (confirm('Are you sure you want to delete this template?')) {
            deleteMutation.mutate({ id });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Key Templates</h1>
                    <p className="text-muted-foreground">
                        Manage templates to quickly create access keys with predefined settings.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Create Template
                </Button>
            </div>

            {isLoading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-48 bg-muted animate-pulse rounded-xl" />
                    ))}
                </div>
            ) : templates?.length === 0 ? (
                <Card className="p-12 text-center">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium">No templates found</h3>
                    <p className="text-muted-foreground mb-4">Create a template to standardise your key creation process.</p>
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Create First Template
                    </Button>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {templates?.map((template) => (
                        <Card key={template.id} className="group hover:border-primary/50 transition-colors">
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-start justify-between">
                                    <span className="truncate" title={template.name}>{template.name}</span>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingTemplate(template)}>
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(template.id)}>
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </CardTitle>
                                <CardDescription>{template.description || 'No description'}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <div className="flex justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground">Data Limit</span>
                                    <span className="font-medium">
                                        {template.dataLimitBytes ? formatBytes(template.dataLimitBytes) : 'Unlimited'}
                                    </span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground">Expiration</span>
                                    <span className="font-medium">
                                        {template.expirationType === 'NEVER' ? 'Never' :
                                            `${template.durationDays} days (${template.expirationType === 'START_ON_FIRST_USE' ? 'on use' : 'fixed'})`}
                                    </span>
                                </div>
                                <div className="flex justify-between py-1 border-b border-border/50">
                                    <span className="text-muted-foreground">Default Server</span>
                                    <span className="font-medium truncate max-w-[150px]">
                                        {template.server?.name || 'None'}
                                    </span>
                                </div>
                                <div className="pt-2">
                                    <Button variant="secondary" size="sm" className="w-full" asChild>
                                        <a href={`/dashboard/keys?action=create&template=${template.id}`}>
                                            <Plus className="w-4 h-4 mr-2" />
                                            Use Template
                                        </a>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Create Dialog */}
            <TemplateDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                onSuccess={() => refetch()}
            />

            {/* Edit Dialog */}
            {editingTemplate && (
                <TemplateDialog
                    open={!!editingTemplate}
                    onOpenChange={(open) => !open && setEditingTemplate(null)}
                    template={editingTemplate}
                    onSuccess={() => refetch()}
                />
            )}
        </div>
    );
}
