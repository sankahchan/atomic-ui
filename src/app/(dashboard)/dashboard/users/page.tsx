'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MobileCardView } from '@/components/mobile-card-view';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ExternalLink, Key, Loader2, Plus, Search, Send, Shield, Trash2, User, Users, Wallet } from 'lucide-react';

type RoleFilter = 'ALL' | 'ADMIN' | 'CLIENT';

function UserStatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="ops-kpi-tile">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function UsersPage() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string } | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [financeDialogOpen, setFinanceDialogOpen] = useState(false);
  const [financeOwnerEmails, setFinanceOwnerEmails] = useState('');
  const [financeOperatorEmails, setFinanceOperatorEmails] = useState('');
  const [financeDigestEnabled, setFinanceDigestEnabled] = useState(false);
  const [financeDigestHour, setFinanceDigestHour] = useState('21');
  const [financeDigestMinute, setFinanceDigestMinute] = useState('0');

  const { data: users, refetch, isLoading } = trpc.users.list.useQuery();
  const financeControlsQuery = trpc.users.getFinanceControls.useQuery();
  const userList = useMemo(() => users ?? [], [users]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return userList.filter((user) => {
      const matchesQuery = !query || (user.email || '').toLowerCase().includes(query);
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      return matchesQuery && matchesRole;
    });
  }, [roleFilter, search, userList]);

  const adminCount = userList.filter((user) => user.role === 'ADMIN').length;
  const clientCount = userList.filter((user) => user.role === 'CLIENT').length;
  const assignedKeyCount = userList.reduce(
    (total, user) => total + ((user as { _count?: { accessKeys?: number } })._count?.accessKeys || 0),
    0
  );

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
      setDeletingUserId(null);
      refetch();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setDeletingUserId(null);
    },
  });

  const updateFinanceControlsMutation = trpc.users.updateFinanceControls.useMutation({
    onSuccess: async () => {
      await financeControlsQuery.refetch();
      toast({
        title: 'Finance controls updated',
        description: 'Finance permissions and digest settings were saved.',
      });
      setFinanceDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Finance controls failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const runFinanceDigestMutation = trpc.users.runFinanceDigestNow.useMutation({
    onSuccess: (result) => {
      toast({
        title: result.skipped ? 'Finance digest skipped' : 'Finance digest sent',
        description: result.skipped
          ? `Reason: ${result.reason || 'n/a'}`
          : `Delivered to ${result.adminChats ?? 0} admin chat(s).`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Finance digest failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    const controls = financeControlsQuery.data;
    if (!controls) {
      return;
    }
    setFinanceOwnerEmails((controls.ownerEmails || []).join(', '));
    setFinanceOperatorEmails((controls.operatorEmails || []).join(', '));
    setFinanceDigestEnabled(Boolean(controls.dailyFinanceDigestEnabled));
    setFinanceDigestHour(String(controls.dailyFinanceDigestHour ?? 21));
    setFinanceDigestMinute(String(controls.dailyFinanceDigestMinute ?? 0));
  }, [financeControlsQuery.data]);

  const handleCreate = () => {
    if (!newUserEmail || !newUserPassword) return;
    createMutation.mutate({
      email: newUserEmail,
      password: newUserPassword,
    });
  };

  const handleDelete = (id: string, email: string) => {
    setUserToDelete({ id, email });
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
              <Users className="mr-2 h-3.5 w-3.5" />
              User Directory
            </Badge>

            <div className="space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl xl:text-[2.7rem]">
                User management
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                Manage administrative access, provision portal users, and keep client accounts aligned with active keys.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <UserStatCard
                label="Total users"
                value={userList.length}
                helper="Admin and client accounts in the panel."
              />
              <UserStatCard
                label="Admins"
                value={adminCount}
                helper="Accounts with dashboard-level access."
              />
              <UserStatCard
                label="Clients"
                value={clientCount}
                helper="Portal-only accounts for end users."
              />
              <UserStatCard
                label="Assigned keys"
                value={assignedKeyCount}
                helper="Access keys currently mapped to users."
              />
            </div>
          </div>

          <div className="ops-detail-rail">
            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">User controls</p>
                <h2 className="text-xl font-semibold">Command rail</h2>
                <p className="text-sm text-muted-foreground">
                  Add a new portal user, then jump into sessions or security settings without leaving the directory.
                </p>
              </div>

              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="h-11 w-full rounded-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Add user
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create client user</DialogTitle>
                    <DialogDescription>
                      Create a portal-only user for subscriptions, usage visibility, and key delivery.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-user-email">Email</Label>
                      <Input
                        id="new-user-email"
                        placeholder="user@example.com"
                        type="email"
                        value={newUserEmail}
                        onChange={(event) => setNewUserEmail(event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-user-password">Password</Label>
                      <Input
                        id="new-user-password"
                        placeholder="Enter a temporary password"
                        type="password"
                        value={newUserPassword}
                        onChange={(event) => setNewUserPassword(event.target.value)}
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreate}
                      disabled={createMutation.isPending || !newUserEmail || !newUserPassword}
                    >
                      {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create user
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="space-y-2">
                <Link href="/dashboard/sessions" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <User className="h-4 w-4 text-primary" />
                    Review sessions
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Link href="/dashboard/security" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Shield className="h-4 w-4 text-primary" />
                    Open security
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Link href="/dashboard/analytics" className="ops-action-tile">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4 text-primary" />
                    Revenue overview
                  </span>
                  <span className="text-xs text-muted-foreground">Open</span>
                </Link>
                <Dialog open={financeDialogOpen} onOpenChange={setFinanceDialogOpen}>
                  <DialogTrigger asChild>
                    <button type="button" className="ops-action-tile text-left">
                      <span className="inline-flex items-center gap-2 text-sm font-medium">
                        <Wallet className="h-4 w-4 text-primary" />
                        Finance controls
                      </span>
                      <span className="text-xs text-muted-foreground">Manage</span>
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Finance controls</DialogTitle>
                      <DialogDescription>
                        Limit who can refund or credit Telegram orders, and control the daily finance digest.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="finance-owner-emails">Owner emails</Label>
                        <Input
                          id="finance-owner-emails"
                          placeholder="owner@example.com, second-owner@example.com"
                          value={financeOwnerEmails}
                          onChange={(event) => setFinanceOwnerEmails(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Leave blank to let any admin configure finance controls.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="finance-operator-emails">Finance operator emails</Label>
                        <Input
                          id="finance-operator-emails"
                          placeholder="finance@example.com, reviewer@example.com"
                          value={financeOperatorEmails}
                          onChange={(event) => setFinanceOperatorEmails(event.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          These admins can verify, refund, and credit orders.
                        </p>
                      </div>
                      <div className="flex items-center justify-between rounded-xl border border-border/50 p-3">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Daily finance digest</p>
                          <p className="text-xs text-muted-foreground">
                            Send revenue, refund, credit, and pending refund-request summaries to admin chats.
                          </p>
                        </div>
                        <Select value={financeDigestEnabled ? 'enabled' : 'disabled'} onValueChange={(value) => setFinanceDigestEnabled(value === 'enabled')}>
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="enabled">Enabled</SelectItem>
                            <SelectItem value="disabled">Disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="finance-digest-hour">Digest hour</Label>
                          <Input
                            id="finance-digest-hour"
                            inputMode="numeric"
                            value={financeDigestHour}
                            onChange={(event) => setFinanceDigestHour(event.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="finance-digest-minute">Digest minute</Label>
                          <Input
                            id="finance-digest-minute"
                            inputMode="numeric"
                            value={financeDigestMinute}
                            onChange={(event) => setFinanceDigestMinute(event.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <DialogFooter className="gap-2 sm:justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => runFinanceDigestMutation.mutate()}
                        disabled={!financeControlsQuery.data?.permissions.canManage || runFinanceDigestMutation.isPending}
                      >
                        {runFinanceDigestMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Send digest now
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setFinanceDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button
                          onClick={() =>
                            updateFinanceControlsMutation.mutate({
                              ownerEmails: financeOwnerEmails
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean),
                              operatorEmails: financeOperatorEmails
                                .split(',')
                                .map((value) => value.trim())
                                .filter(Boolean),
                              dailyFinanceDigestEnabled: financeDigestEnabled,
                              dailyFinanceDigestHour: Math.min(23, Math.max(0, Number(financeDigestHour) || 0)),
                              dailyFinanceDigestMinute: Math.min(59, Math.max(0, Number(financeDigestMinute) || 0)),
                            })
                          }
                          disabled={!financeControlsQuery.data?.permissions.canConfigure || updateFinanceControlsMutation.isPending}
                        >
                          {updateFinanceControlsMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Save finance controls
                        </Button>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="ops-panel space-y-3">
              <div className="space-y-1">
                <p className="ops-section-heading">Access note</p>
                <h2 className="text-xl font-semibold">Account policy</h2>
              </div>
              <div className="ops-detail-card space-y-2">
                <p className="text-sm text-muted-foreground">
                  Admins can manage the full control center. Client users only access their subscription and key delivery portal.
                </p>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Role split</p>
                    <p className="mt-2 text-sm font-medium">{adminCount} admin / {clientCount} client</p>
                  </div>
                  <div className="ops-mini-tile">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Key coverage</p>
                    <p className="mt-2 text-sm font-medium">{assignedKeyCount} assigned access keys</p>
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
            <Users className="h-5 w-5 text-primary" />
            User inventory
          </CardTitle>
          <CardDescription>
            Search by email or focus on one role to manage access and assigned keys faster.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <div className="ops-filter-bar grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="user-search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="user-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search users by email"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-role-filter">Role</Label>
              <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
                <SelectTrigger id="user-role-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                  <SelectItem value="CLIENT">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ops-table-meta">{filteredUsers.length} users</div>
          </div>

          <div className="hidden md:block">
            <div className="ops-data-shell">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Assigned keys</TableHead>
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
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        {userList.length === 0 ? 'No users found.' : 'No users match the current filters.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => {
                      const assignedKeys = (user as { _count?: { accessKeys?: number } })._count?.accessKeys || 0;
                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-cyan-400/10 dark:text-cyan-200">
                                <User className="h-4 w-4" />
                              </span>
                              <div>
                                <p className="font-medium">{user.email}</p>
                                <p className="text-xs text-muted-foreground">
                                  {user.role === 'ADMIN' ? 'Dashboard access' : 'Portal-only access'}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Key className="h-3.5 w-3.5 text-muted-foreground" />
                              {assignedKeys}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/dashboard/users/${user.id}`}>
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  Ledger
                                </Link>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDelete(user.id, user.email || 'Unknown')}
                                disabled={user.role === 'ADMIN' || (deleteMutation.isPending && deletingUserId === user.id)}
                                title={user.role === 'ADMIN' ? 'Cannot delete admin' : 'Delete user'}
                              >
                                {deleteMutation.isPending && deletingUserId === user.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <MobileCardView
            data={filteredUsers}
            emptyMessage={userList.length === 0 ? 'No users found.' : 'No users match the current filters.'}
            keyExtractor={(user) => user.id}
            renderCard={(user) => {
              const assignedKeys = (user as { _count?: { accessKeys?: number } })._count?.accessKeys || 0;
              const deleting = deleteMutation.isPending && deletingUserId === user.id;

              return (
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary dark:bg-cyan-400/10 dark:text-cyan-200">
                          <User className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="font-medium">{user.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.role === 'ADMIN' ? 'Dashboard access' : 'Portal-only access'}
                          </p>
                        </div>
                      </div>
                      <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(user.id, user.email || 'Unknown')}
                      disabled={user.role === 'ADMIN' || deleting}
                    >
                      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Created</p>
                      <p className="mt-2 text-sm font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="ops-mini-tile">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assigned keys</p>
                      <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium">
                        <Key className="h-3.5 w-3.5 text-muted-foreground" />
                        {assignedKeys}
                      </p>
                    </div>
                  </div>

                  <Button asChild variant="outline" className="w-full rounded-full">
                    <Link href={`/dashboard/users/${user.id}`}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open ledger
                    </Link>
                  </Button>
                </div>
              );
            }}
          />
        </CardContent>
      </Card>

      <ConfirmationDialog
        open={!!userToDelete}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
          }
        }}
        title="Delete user"
        description={userToDelete ? `Are you sure you want to delete user ${userToDelete.email}?` : ''}
        confirmLabel="Delete user"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (!userToDelete) return;
          setDeletingUserId(userToDelete.id);
          deleteMutation.mutate({ id: userToDelete.id });
        }}
      />
    </div>
  );
}
