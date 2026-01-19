
'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, User, Key, RefreshCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useLocale } from '@/hooks/use-locale';
import { MobileCardView } from '@/components/mobile-card-view';


export default function UsersPage() {
    const { t } = useLocale();
    const { toast } = useToast();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');

    // Fetch users
    const { data: users, refetch, isLoading } = trpc.users.list.useQuery();

    // Mutations
    const createMutation = trpc.users.createClient.useMutation({
        onSuccess: () => {
            toast({
                title: 'User created',
                description: 'Client user has been successfully created.',
            });
            setIsCreateOpen(false);
            setNewUserEmail('');
            setNewUserPassword('');
            refetch();
        },
        onError: (error) => {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        },
    });

    const deleteMutation = trpc.users.delete.useMutation({
        onSuccess: () => {
            toast({
                title: 'User deleted',
                description: 'User has been removed.',
            });
            refetch();
        },
        onError: (error) => {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        },
    });

    const handleCreate = () => {
        if (!newUserEmail || !newUserPassword) return;
        createMutation.mutate({
            email: newUserEmail,
            password: newUserPassword,
        });
    };

    const handleDelete = (id: string, email: string) => {
        if (confirm(`Are you sure you want to delete user ${email}?`)) {
            deleteMutation.mutate({ id });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
                    <p className="text-muted-foreground">
                        Manage admin and client accounts.
                    </p>
                </div>
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                    <DialogTrigger asChild>
                        <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Add User
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Create Client User</DialogTitle>
                            <DialogDescription>
                                Create a new user account with Client role. They will only have access to the User Portal.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Input
                                    placeholder="Email"
                                    type="email"
                                    value={newUserEmail}
                                    onChange={(e) => setNewUserEmail(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Input
                                    placeholder="Password"
                                    type="password"
                                    value={newUserPassword}
                                    onChange={(e) => setNewUserPassword(e.target.value)}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsCreateOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleCreate}
                                disabled={createMutation.isPending || !newUserEmail || !newUserPassword}
                            >
                                {createMutation.isPending ? 'Creating...' : 'Create User'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Desktop View */}
            <div className="hidden md:block rounded-md border bg-card">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Assigned Keys</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    Loading users...
                                </TableCell>
                            </TableRow>
                        ) : users?.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-24 text-center">
                                    No users found.
                                </TableCell>
                            </TableRow>
                        ) : (
                            users?.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">
                                        <div className="flex items-center gap-2">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                            {user.email}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                                            {user.role}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <Key className="h-3 w-3 text-muted-foreground" />
                                            {(user as any)._count?.accessKeys || 0}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleDelete(user.id, user.email || 'Unknown')}
                                            disabled={user.role === 'ADMIN'} // Prevent deleting admins for now
                                            title={user.role === 'ADMIN' ? "Cannot delete admin" : "Delete user"}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Mobile View */}
            <MobileCardView
                data={users || []}
                keyExtractor={(user) => user.id}
                renderCard={(user) => (
                    <div className="space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="flex items-center gap-2 font-medium">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    {user.email}
                                </div>
                                <div className="mt-1">
                                    <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                                        {user.role}
                                    </Badge>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 -mt-2 -mr-2"
                                onClick={() => handleDelete(user.id, user.email || 'Unknown')}
                                disabled={user.role === 'ADMIN'}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wider mb-1">Created</p>
                                <p className="text-foreground">{new Date(user.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wider mb-1">Keys</p>
                                <div className="flex items-center gap-1 text-foreground">
                                    <Key className="h-3 w-3" />
                                    {(user as any)._count?.accessKeys || 0}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            />
        </div>
    );
}
