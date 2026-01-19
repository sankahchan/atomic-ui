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
import { ShieldCheck, Plus, Trash2, Power, Globe, Network, AlertTriangle } from 'lucide-react';

function CreateRuleDialog({
    open,
    onOpenChange,
    onSuccess,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}) {
    const { toast } = useToast();
    const [formData, setFormData] = useState({
        type: 'BLOCK',
        targetType: 'IP',
        targetValue: '',
        description: '',
    });

    const createMutation = trpc.security.createRule.useMutation({
        onSuccess: () => {
            toast({ title: 'Rule created', description: 'Security rule has been added.' });
            setFormData({ type: 'BLOCK', targetType: 'IP', targetValue: '', description: '' });
            onSuccess();
            onOpenChange(false);
        },
        onError: (err) => toast({ title: 'Failed to create', description: err.message, variant: 'destructive' }),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        createMutation.mutate(formData as any);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Add Security Rule</DialogTitle>
                    <DialogDescription>
                        Control access to the dashboard by IP, CIDR, or Country.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Action</Label>
                            <Select
                                value={formData.type}
                                onValueChange={(val) => setFormData({ ...formData, type: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="BLOCK">Block (Deny)</SelectItem>
                                    <SelectItem value="ALLOW">Allow (Whitelist)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Target Type</Label>
                            <Select
                                value={formData.targetType}
                                onValueChange={(val) => setFormData({ ...formData, targetType: val })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="IP">IP Address</SelectItem>
                                    <SelectItem value="CIDR">CIDR Range</SelectItem>
                                    <SelectItem value="COUNTRY">Country Code</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>
                            {formData.targetType === 'IP' ? 'IP Address' :
                                formData.targetType === 'CIDR' ? 'CIDR Range (e.g. 10.0.0.0/24)' :
                                    'Country Code (2-letter ISO, e.g. US, CN)'}
                        </Label>
                        <Input
                            value={formData.targetValue}
                            onChange={(e) => setFormData({ ...formData, targetValue: e.target.value })}
                            placeholder={
                                formData.targetType === 'IP' ? '192.168.1.1' :
                                    formData.targetType === 'CIDR' ? '10.0.0.0/24' :
                                        'US'
                            }
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Description</Label>
                        <Input
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="e.g. Block suspicious subnet"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={createMutation.isPending}>
                            {createMutation.isPending && 'Adding...'}
                            {!createMutation.isPending && 'Add Rule'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function SecurityPage() {
    const { toast } = useToast();
    const [createOpen, setCreateOpen] = useState(false);

    const { data: rules, isLoading, refetch } = trpc.security.listRules.useQuery();

    const toggleMutation = trpc.security.toggleRule.useMutation({
        onSuccess: () => refetch(),
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    const deleteMutation = trpc.security.deleteRule.useMutation({
        onSuccess: () => {
            toast({ title: 'Rule deleted' });
            refetch();
        },
        onError: (err) => toast({ title: 'Error', description: err.message, variant: 'destructive' }),
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                        Security & Access Control
                    </h1>
                    <p className="text-muted-foreground">
                        Manage firewall rules to restrict access to this dashboard.
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Rule
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-red-500/10 border-red-500/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg text-red-500 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5" />
                            Confirmation
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-red-400">
                            Be careful when adding blocking rules. Ensure you do not block your own IP address. Localhost is always allowed.
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Active Rules</CardTitle>
                    <CardDescription>
                        Rules are evaluated in order: Allowed Localhost → Block Rules → Allow Rules.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            {[1, 2, 3].map(i => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
                        </div>
                    ) : rules?.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No security rules defined. All traffic is allowed.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {rules?.map((rule) => (
                                <div key={rule.id} className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                                    <div className="flex items-start gap-4">
                                        <div className={`p-2 rounded-full ${rule.type === 'BLOCK' ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                                            {rule.type === 'BLOCK' ? <ShieldCheck className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold">{rule.targetValue}</span>
                                                <Badge variant="outline">{rule.targetType}</Badge>
                                                <Badge variant={rule.type === 'BLOCK' ? 'destructive' : 'default'}>{rule.type}</Badge>
                                                {!rule.isActive && <Badge variant="secondary">DISABLED</Badge>}
                                            </div>
                                            {rule.description && (
                                                <p className="text-sm text-muted-foreground mt-1">{rule.description}</p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => toggleMutation.mutate({ id: rule.id })}
                                            title={rule.isActive ? "Disable Rule" : "Enable Rule"}
                                        >
                                            <Power className={`w-4 h-4 ${rule.isActive ? 'text-green-500' : 'text-muted-foreground'}`} />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive"
                                            onClick={() => {
                                                if (confirm('Delete this rule?')) deleteMutation.mutate({ id: rule.id });
                                            }}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <CreateRuleDialog open={createOpen} onOpenChange={setCreateOpen} onSuccess={() => refetch()} />
        </div>
    );
}
