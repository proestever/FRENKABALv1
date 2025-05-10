import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import { 
  AlertTriangle, UserPlus, DollarSign, Package, Settings, Search, 
  ShieldCheck, CheckCircle, XCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface UserData {
  id: number;
  username: string;
  displayName?: string;
}

interface UserCredits {
  id: number;
  userId: number;
  balance: number;
  lifetimeCredits: number;
  lifetimeSpent: number;
  createdAt: string;
  updatedAt: string;
}

interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  plsCost: string;
  isActive: boolean;
  displayOrder: number;
}

interface CreditUsageSetting {
  id: number;
  featureKey: string;
  displayName: string;
  creditCost: number;
  isActive: boolean;
  description: string | null;
}

interface CreditPayment {
  id: number;
  userId: number;
  packageId: number | null;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  plsAmount: string;
  creditsAwarded: number;
  status: string;
  confirmedAt: string | null;
  createdAt: string;
}

const AdminCredits: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [awardCreditsAmount, setAwardCreditsAmount] = useState<number>(0);
  const [awardCreditsReason, setAwardCreditsReason] = useState<string>('');
  const [newPackage, setNewPackage] = useState({
    name: '',
    credits: 0,
    plsCost: '',
    isActive: true,
    displayOrder: 0
  });
  const [newSetting, setNewSetting] = useState({
    featureKey: '',
    displayName: '',
    creditCost: 0,
    isActive: true,
    description: ''
  });
  const [searchUser, setSearchUser] = useState('');
  
  // Check if user is admin (in a real app, this would be more sophisticated)
  const isAdmin = user?.username?.includes('admin') || true; // For testing
  
  // Redirect if not admin
  React.useEffect(() => {
    if (user && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "You do not have permission to access this page.",
        variant: "destructive",
      });
      setLocation('/');
    }
  }, [user, isAdmin, setLocation, toast]);
  
  // Fetch users
  const { 
    data: users, 
    isLoading: isLoadingUsers 
  } = useQuery({
    queryKey: ['/api/users'],
    queryFn: () => apiRequest('/api/users'),
    enabled: isAdmin,
  });
  
  // Fetch credit packages
  const { 
    data: packages, 
    isLoading: isLoadingPackages 
  } = useQuery({
    queryKey: ['/api/credit-packages'],
    queryFn: () => apiRequest('/api/credit-packages'),
    enabled: isAdmin,
  });
  
  // Fetch credit usage settings
  const { 
    data: settings, 
    isLoading: isLoadingSettings 
  } = useQuery({
    queryKey: ['/api/credit-usage-settings'],
    queryFn: () => apiRequest('/api/credit-usage-settings'),
    enabled: isAdmin,
  });
  
  // Fetch pending payments
  const { 
    data: payments, 
    isLoading: isLoadingPayments 
  } = useQuery({
    queryKey: ['/api/credit-payments'],
    queryFn: () => apiRequest('/api/credit-payments?status=pending'),
    enabled: isAdmin,
  });
  
  // Fetch user credits if a user is selected
  const { 
    data: selectedUserCredits, 
    isLoading: isLoadingSelectedUserCredits 
  } = useQuery({
    queryKey: ['/api/users', selectedUserId, 'credits'],
    queryFn: () => apiRequest(`/api/users/${selectedUserId}/credits`),
    enabled: !!selectedUserId && isAdmin,
  });
  
  // Award credits to user mutation
  const awardCreditsMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/admin/users/${selectedUserId}/award-credits`, {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        adminUserId: user?.id,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', selectedUserId, 'credits'] });
      toast({
        title: "Credits Awarded",
        description: `Successfully awarded ${awardCreditsAmount} credits to the user.`,
      });
      setAwardCreditsAmount(0);
      setAwardCreditsReason('');
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to award credits: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });
  
  // Create credit package mutation
  const createPackageMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/credit-packages', {
      method: 'POST',
      body: JSON.stringify({
        adminUserId: user?.id,
        package: data,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/credit-packages'] });
      toast({
        title: "Package Created",
        description: "Credit package created successfully.",
      });
      setNewPackage({
        name: '',
        credits: 0,
        plsCost: '',
        isActive: true,
        displayOrder: 0
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create package: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });
  
  // Create credit usage setting mutation
  const createSettingMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/credit-usage-settings', {
      method: 'POST',
      body: JSON.stringify({
        adminUserId: user?.id,
        setting: data,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/credit-usage-settings'] });
      toast({
        title: "Setting Created",
        description: "Credit usage setting created successfully.",
      });
      setNewSetting({
        featureKey: '',
        displayName: '',
        creditCost: 0,
        isActive: true,
        description: ''
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to create setting: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });
  
  // Confirm payment mutation
  const confirmPaymentMutation = useMutation({
    mutationFn: (paymentId: number) => apiRequest(`/api/credit-payments/${paymentId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({
        adminUserId: user?.id,
      }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/credit-payments'] });
      toast({
        title: "Payment Confirmed",
        description: "Payment has been confirmed and credits awarded.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to confirm payment: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  });
  
  const handleAwardCredits = () => {
    if (!selectedUserId) {
      toast({
        title: "Error",
        description: "Please select a user first.",
        variant: "destructive",
      });
      return;
    }
    
    if (awardCreditsAmount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a positive credit amount.",
        variant: "destructive",
      });
      return;
    }
    
    awardCreditsMutation.mutate({
      amount: awardCreditsAmount,
      reason: awardCreditsReason,
    });
  };
  
  const handleCreatePackage = () => {
    if (!newPackage.name || newPackage.credits <= 0 || !newPackage.plsCost) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    createPackageMutation.mutate(newPackage);
  };
  
  const handleCreateSetting = () => {
    if (!newSetting.featureKey || !newSetting.displayName || newSetting.creditCost < 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    
    createSettingMutation.mutate(newSetting);
  };
  
  const handleConfirmPayment = (paymentId: number) => {
    confirmPaymentMutation.mutate(paymentId);
  };
  
  // Filter users based on search input
  const filteredUsers = users ? users.filter((u: UserData) => 
    u.username.toLowerCase().includes(searchUser.toLowerCase()) || 
    (u.displayName?.toLowerCase().includes(searchUser.toLowerCase()))
  ) : [];
  
  if (!isAdmin) {
    return (
      <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            You do not have permission to access this page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin: Credit Management</h1>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-orange-500" />
          <span className="font-bold">Admin Mode</span>
        </div>
      </div>
      
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="users">Manage User Credits</TabsTrigger>
          <TabsTrigger value="packages">Credit Packages</TabsTrigger>
          <TabsTrigger value="settings">Usage Settings</TabsTrigger>
          <TabsTrigger value="payments">Pending Payments</TabsTrigger>
        </TabsList>
        
        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Manage User Credits</CardTitle>
              <CardDescription>Award, adjust, or view credit balances</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex mb-4">
                <div className="flex-1 mr-4">
                  <Label htmlFor="search-user">Search Users</Label>
                  <div className="flex mt-1">
                    <Input
                      id="search-user"
                      placeholder="Search by username or display name"
                      value={searchUser}
                      onChange={(e) => setSearchUser(e.target.value)}
                      className="flex-1"
                    />
                    <Button variant="ghost" className="ml-2">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="md:col-span-2 border rounded-md h-[400px] overflow-y-auto">
                  <div className="p-3 bg-muted font-medium">Users</div>
                  {isLoadingUsers ? (
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : filteredUsers.length > 0 ? (
                    <div className="divide-y">
                      {filteredUsers.map((user: UserData) => (
                        <div 
                          key={user.id}
                          className={`p-3 cursor-pointer hover:bg-accent ${
                            selectedUserId === user.id ? 'bg-accent' : ''
                          }`}
                          onClick={() => setSelectedUserId(user.id)}
                        >
                          <div className="font-medium">{user.displayName || user.username}</div>
                          <div className="text-sm text-muted-foreground">{user.username}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      No users found
                    </div>
                  )}
                </div>
                
                <div className="md:col-span-3">
                  {selectedUserId ? (
                    <div>
                      <h3 className="text-lg font-medium mb-4">
                        User Details {isLoadingSelectedUserCredits && '(Loading...)'}
                      </h3>
                      
                      {selectedUserCredits ? (
                        <div className="space-y-6">
                          <div className="grid grid-cols-3 gap-4">
                            <div className="bg-card border rounded-md p-4">
                              <div className="text-sm text-muted-foreground">Balance</div>
                              <div className="text-2xl font-bold">{selectedUserCredits.balance}</div>
                            </div>
                            <div className="bg-card border rounded-md p-4">
                              <div className="text-sm text-muted-foreground">Total Purchased</div>
                              <div className="text-2xl font-bold">{selectedUserCredits.lifetimeCredits}</div>
                            </div>
                            <div className="bg-card border rounded-md p-4">
                              <div className="text-sm text-muted-foreground">Total Spent</div>
                              <div className="text-2xl font-bold">{selectedUserCredits.lifetimeSpent}</div>
                            </div>
                          </div>
                          
                          <div className="border rounded-md p-4">
                            <h3 className="text-lg font-medium mb-3">Award Credits</h3>
                            <div className="space-y-4">
                              <div>
                                <Label htmlFor="credit-amount">Credit Amount</Label>
                                <Input
                                  id="credit-amount"
                                  type="number"
                                  min="1"
                                  value={awardCreditsAmount || ''}
                                  onChange={(e) => setAwardCreditsAmount(parseInt(e.target.value) || 0)}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor="credit-reason">Reason (Optional)</Label>
                                <Textarea
                                  id="credit-reason"
                                  placeholder="Enter reason for credit adjustment"
                                  value={awardCreditsReason}
                                  onChange={(e) => setAwardCreditsReason(e.target.value)}
                                  className="mt-1"
                                />
                              </div>
                              <Button 
                                onClick={handleAwardCredits}
                                disabled={awardCreditsMutation.isPending || awardCreditsAmount <= 0}
                                className="w-full"
                              >
                                {awardCreditsMutation.isPending ? 'Processing...' : 'Award Credits'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : isLoadingSelectedUserCredits ? (
                        <div className="space-y-3">
                          <Skeleton className="h-24 w-full" />
                          <Skeleton className="h-48 w-full" />
                        </div>
                      ) : (
                        <div className="text-center text-muted-foreground py-6">
                          <UserPlus className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                          <p>This user has no credit record yet.</p>
                          <Button 
                            variant="outline" 
                            className="mt-3"
                            onClick={() => {
                              // Initialize user credits
                              awardCreditsMutation.mutate({
                                amount: 0,
                                reason: "Initialize credit account",
                              });
                            }}
                          >
                            Initialize Credit Account
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-12">
                      <UserPlus className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                      <p>Select a user to manage their credits</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="packages" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Credit Packages</CardTitle>
              <CardDescription>Manage available credit purchase options</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-8">
                <h3 className="text-lg font-medium mb-3">Create New Package</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="package-name">Package Name</Label>
                    <Input
                      id="package-name"
                      placeholder="e.g., Basic Package"
                      value={newPackage.name}
                      onChange={(e) => setNewPackage({...newPackage, name: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="package-credits">Credits</Label>
                    <Input
                      id="package-credits"
                      type="number"
                      min="1"
                      placeholder="e.g., 1000"
                      value={newPackage.credits || ''}
                      onChange={(e) => setNewPackage({...newPackage, credits: parseInt(e.target.value) || 0})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="package-cost">PLS Cost</Label>
                    <Input
                      id="package-cost"
                      placeholder="e.g., 3000"
                      value={newPackage.plsCost}
                      onChange={(e) => setNewPackage({...newPackage, plsCost: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="package-order">Display Order</Label>
                    <Input
                      id="package-order"
                      type="number"
                      min="0"
                      placeholder="e.g., 1"
                      value={newPackage.displayOrder || ''}
                      onChange={(e) => setNewPackage({...newPackage, displayOrder: parseInt(e.target.value) || 0})}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is-active"
                      checked={newPackage.isActive}
                      onCheckedChange={(checked) => setNewPackage({...newPackage, isActive: checked})}
                    />
                    <Label htmlFor="is-active">Package is active</Label>
                  </div>
                  <div className="md:col-span-2">
                    <Button 
                      onClick={handleCreatePackage}
                      disabled={createPackageMutation.isPending}
                      className="w-full"
                    >
                      {createPackageMutation.isPending ? 'Creating...' : 'Create Package'}
                    </Button>
                  </div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <h3 className="text-lg font-medium mb-3">Existing Packages</h3>
              {isLoadingPackages ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : packages && packages.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>PLS Cost</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Display Order</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {packages.map((pkg: CreditPackage) => (
                      <TableRow key={pkg.id}>
                        <TableCell className="font-medium">{pkg.name}</TableCell>
                        <TableCell>{pkg.credits.toLocaleString()}</TableCell>
                        <TableCell>{parseInt(pkg.plsCost).toLocaleString()} PLS</TableCell>
                        <TableCell>{(parseInt(pkg.plsCost) / pkg.credits).toFixed(4)} PLS/credit</TableCell>
                        <TableCell>
                          {pkg.isActive ? (
                            <span className="flex items-center text-green-600">
                              <CheckCircle className="h-4 w-4 mr-1" /> Active
                            </span>
                          ) : (
                            <span className="flex items-center text-red-600">
                              <XCircle className="h-4 w-4 mr-1" /> Inactive
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{pkg.displayOrder}</TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">Edit</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit Package</DialogTitle>
                                <DialogDescription>
                                  Update the details for this credit package.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div>
                                  <Label htmlFor="edit-name">Package Name</Label>
                                  <Input id="edit-name" defaultValue={pkg.name} className="mt-1" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label htmlFor="edit-credits">Credits</Label>
                                    <Input id="edit-credits" type="number" defaultValue={pkg.credits} className="mt-1" />
                                  </div>
                                  <div>
                                    <Label htmlFor="edit-cost">PLS Cost</Label>
                                    <Input id="edit-cost" defaultValue={pkg.plsCost} className="mt-1" />
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Switch id="edit-active" defaultChecked={pkg.isActive} />
                                  <Label htmlFor="edit-active">Package is active</Label>
                                </div>
                              </div>
                              <DialogFooter>
                                <Button type="submit">Save Changes</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>No credit packages found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="settings" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Credit Usage Settings</CardTitle>
              <CardDescription>Configure how credits are used in the application</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-8">
                <h3 className="text-lg font-medium mb-3">Create New Usage Setting</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="setting-key">Feature Key</Label>
                    <Input
                      id="setting-key"
                      placeholder="e.g., wallet_search"
                      value={newSetting.featureKey}
                      onChange={(e) => setNewSetting({...newSetting, featureKey: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="setting-name">Display Name</Label>
                    <Input
                      id="setting-name"
                      placeholder="e.g., Wallet Search"
                      value={newSetting.displayName}
                      onChange={(e) => setNewSetting({...newSetting, displayName: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="setting-cost">Credit Cost</Label>
                    <Input
                      id="setting-cost"
                      type="number"
                      min="0"
                      placeholder="e.g., 10"
                      value={newSetting.creditCost || ''}
                      onChange={(e) => setNewSetting({...newSetting, creditCost: parseInt(e.target.value) || 0})}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="setting-active"
                      checked={newSetting.isActive}
                      onCheckedChange={(checked) => setNewSetting({...newSetting, isActive: checked})}
                    />
                    <Label htmlFor="setting-active">Setting is active</Label>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="setting-description">Description</Label>
                    <Textarea
                      id="setting-description"
                      placeholder="Description of what this feature does and why it costs credits"
                      value={newSetting.description}
                      onChange={(e) => setNewSetting({...newSetting, description: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Button 
                      onClick={handleCreateSetting}
                      disabled={createSettingMutation.isPending}
                      className="w-full"
                    >
                      {createSettingMutation.isPending ? 'Creating...' : 'Create Setting'}
                    </Button>
                  </div>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <h3 className="text-lg font-medium mb-3">Existing Settings</h3>
              {isLoadingSettings ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : settings && settings.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Feature Key</TableHead>
                      <TableHead>Display Name</TableHead>
                      <TableHead>Credit Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.map((setting: CreditUsageSetting) => (
                      <TableRow key={setting.id}>
                        <TableCell className="font-medium">{setting.featureKey}</TableCell>
                        <TableCell>{setting.displayName}</TableCell>
                        <TableCell>{setting.creditCost}</TableCell>
                        <TableCell>
                          {setting.isActive ? (
                            <span className="flex items-center text-green-600">
                              <CheckCircle className="h-4 w-4 mr-1" /> Active
                            </span>
                          ) : (
                            <span className="flex items-center text-red-600">
                              <XCircle className="h-4 w-4 mr-1" /> Inactive
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="sm">Edit</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Edit Usage Setting</DialogTitle>
                                <DialogDescription>
                                  Update the details for this credit usage setting.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div>
                                  <Label htmlFor="edit-display-name">Display Name</Label>
                                  <Input id="edit-display-name" defaultValue={setting.displayName} className="mt-1" />
                                </div>
                                <div>
                                  <Label htmlFor="edit-credit-cost">Credit Cost</Label>
                                  <Input id="edit-credit-cost" type="number" defaultValue={setting.creditCost} className="mt-1" />
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Switch id="edit-setting-active" defaultChecked={setting.isActive} />
                                  <Label htmlFor="edit-setting-active">Setting is active</Label>
                                </div>
                                <div>
                                  <Label htmlFor="edit-description">Description</Label>
                                  <Textarea id="edit-description" defaultValue={setting.description || ''} className="mt-1" />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button type="submit">Save Changes</Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>No usage settings found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="payments" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Payments</CardTitle>
              <CardDescription>Review and approve credit purchase transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingPayments ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : payments && payments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Credits</TableHead>
                      <TableHead>Transaction Hash</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment: CreditPayment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{new Date(payment.createdAt).toLocaleString()}</TableCell>
                        <TableCell>User #{payment.userId}</TableCell>
                        <TableCell>{parseInt(payment.plsAmount).toLocaleString()} PLS</TableCell>
                        <TableCell>{payment.creditsAwarded.toLocaleString()}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          <a 
                            href={`https://scan.pulsechain.com/tx/${payment.txHash}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {payment.txHash}
                          </a>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm">Review</Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Confirm Payment</DialogTitle>
                                <DialogDescription>
                                  Verify the payment details before confirming.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <Label>User ID</Label>
                                    <div className="mt-1 font-medium">{payment.userId}</div>
                                  </div>
                                  <div>
                                    <Label>Amount</Label>
                                    <div className="mt-1 font-medium">{parseInt(payment.plsAmount).toLocaleString()} PLS</div>
                                  </div>
                                </div>
                                <div>
                                  <Label>Transaction Hash</Label>
                                  <div className="mt-1 font-medium break-all">{payment.txHash}</div>
                                </div>
                                <div>
                                  <Label>Credits to Award</Label>
                                  <div className="mt-1 font-medium">{payment.creditsAwarded.toLocaleString()} credits</div>
                                </div>
                                <Alert>
                                  <AlertTitle>Verify Transaction</AlertTitle>
                                  <AlertDescription>
                                    Before confirming, please verify this transaction on the PulseChain Explorer.
                                    <div className="mt-2">
                                      <a 
                                        href={`https://scan.pulsechain.com/tx/${payment.txHash}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-blue-600 hover:underline inline-flex items-center"
                                      >
                                        View on Explorer
                                        <DollarSign className="h-4 w-4 ml-1" />
                                      </a>
                                    </div>
                                  </AlertDescription>
                                </Alert>
                              </div>
                              <DialogFooter>
                                <Button 
                                  variant="outline" 
                                  onClick={() => {
                                    // Logic to reject payment would go here
                                  }}
                                >
                                  Reject
                                </Button>
                                <Button 
                                  onClick={() => handleConfirmPayment(payment.id)}
                                  disabled={confirmPaymentMutation.isPending}
                                >
                                  {confirmPaymentMutation.isPending ? 'Processing...' : 'Confirm Payment'}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>No pending payments to review</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCredits;