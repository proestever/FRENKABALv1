import { useState } from 'react';
import { 
  useSubscriptionPackages, 
  useUpdateSubscriptionPaymentStatus, 
  SubscriptionPackage,
  SubscriptionPayment
} from '@/hooks/use-subscription';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useForm, UseFormReturn } from 'react-hook-form';
import { createAllPresetPackages, getPresetDefaultValues } from '@/utils/subscription-presets';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { Plus, Pencil, CheckCircle, XCircle, Clock } from 'lucide-react';

// Schema for subscription package form
const packageFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  durationDays: z.coerce.number().int().min(1, "Duration must be at least 1 day"),
  plsCost: z.string().min(1, "Cost is required"),
  features: z.string().transform(value => {
    if (!value.trim()) return [];
    return value.split('\n').map(v => v.trim()).filter(Boolean);
  }),
  isActive: z.boolean().default(true),
  displayOrder: z.coerce.number().int().min(0, "Display order must be 0 or higher").default(0),
});

type PackageFormValues = z.infer<typeof packageFormSchema>;
type FormProps = UseFormReturn<PackageFormValues>;

export default function AdminSubscriptionsPage() {
  const [activeTab, setActiveTab] = useState('packages');
  const [editingPackage, setEditingPackage] = useState<SubscriptionPackage | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creatingPresets, setCreatingPresets] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: packages, isLoading: isLoadingPackages } = useSubscriptionPackages(false);
  const updatePaymentStatus = useUpdateSubscriptionPaymentStatus();
  
  // Function to handle creating preset packages
  const handleCreatePresets = async () => {
    setCreatingPresets(true);
    
    try {
      const success = await createAllPresetPackages(
        // onSuccess callback
        () => {
          toast({
            title: "Success",
            description: "Created time-based subscription packages (30, 60, 90, 365 days)"
          });
          // Invalidate the subscription packages query to refresh the list
          queryClient.invalidateQueries({ queryKey: ['/api/subscription-packages'] });
        },
        // onError callback
        (error) => {
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to create preset packages",
            variant: "destructive",
          });
        }
      );
    } finally {
      setCreatingPresets(false);
    }
  };
  
  // Get all subscription payments
  const { data: payments, isLoading: isLoadingPayments } = useQuery<SubscriptionPayment[]>({
    queryKey: ['/api/subscription-payments'],
    queryFn: async () => {
      const response = await apiRequest('/api/subscription-payments');
      return response.json();
    },
  });
  
  const form = useForm<PackageFormValues>({
    resolver: zodResolver(packageFormSchema),
    defaultValues: {
      name: '30 Days',
      description: 'Full access to all FrenKabal features',
      durationDays: 30,
      plsCost: '1000000',
      features: 'Real-time wallet tracking\nSupport for all PulseChain tokens\nTransaction history\nPortfolio analytics\nValue tracking',
      isActive: true,
      displayOrder: 0,
    },
  });
  
  const onSubmit = async (data: PackageFormValues) => {
    try {
      // Process features string into array
      const processedData = {
        ...data,
        features: typeof data.features === 'string'
          ? data.features.split('\n').map(f => f.trim()).filter(Boolean)
          : data.features
      };
      
      if (editingPackage) {
        // Update existing package
        await apiRequest({
          url: `/api/subscription-packages/${editingPackage.id}`,
          method: 'PATCH',
          data: processedData
        });
        toast({
          title: "Package Updated",
          description: `The ${data.name} package has been updated.`,
        });
      } else {
        // Create new package
        await apiRequest({
          url: '/api/subscription-packages',
          method: 'POST',
          data: processedData
        });
        toast({
          title: "Package Created",
          description: `The ${data.name} package has been created.`,
        });
      }
      
      setIsDialogOpen(false);
      setEditingPackage(null);
      form.reset();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save subscription package",
        variant: "destructive",
      });
    }
  };
  
  const handleEditPackage = (pkg: SubscriptionPackage) => {
    setEditingPackage(pkg);
    form.reset({
      name: pkg.name,
      description: pkg.description || '',
      durationDays: pkg.durationDays,
      plsCost: pkg.plsCost,
      features: pkg.features ? pkg.features.join('\n') : '',
      isActive: pkg.isActive,
      displayOrder: pkg.displayOrder,
    });
    setIsDialogOpen(true);
  };
  
  const handleNewPackage = () => {
    setEditingPackage(null);
    // Use our preset defaults for a 30-day package
    form.reset(getPresetDefaultValues(30));
    setIsDialogOpen(true);
  };
  
  const handleUpdatePaymentStatus = async (paymentId: number, newStatus: string) => {
    try {
      await updatePaymentStatus.mutateAsync({ id: paymentId, status: newStatus });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update payment status",
        variant: "destructive",
      });
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-500">Confirmed</Badge>;
      case 'rejected':
        return <Badge className="bg-red-500">Rejected</Badge>;
      case 'pending':
      default:
        return <Badge className="bg-yellow-500">Pending</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">Subscription Management</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="mb-4">
          <TabsTrigger value="packages">Subscription Packages</TabsTrigger>
          <TabsTrigger value="payments">Payment History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="packages">
          <div className="flex justify-between mb-4">
            <Button 
              onClick={handleCreatePresets} 
              disabled={creatingPresets}
              variant="outline"
            >
              {creatingPresets ? (
                <>
                  <span className="mr-2 h-4 w-4 animate-spin">⏳</span>
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Time-Based Packages
                </>
              )}
            </Button>
            <Button onClick={handleNewPackage}>
              <Plus className="mr-2 h-4 w-4" />
              New Package
            </Button>
          </div>
          
          <div className="bg-card rounded-md shadow">
            <Table>
              <TableCaption>List of all subscription packages</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cost (PLS)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingPackages ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">Loading packages...</TableCell>
                  </TableRow>
                ) : packages && packages.length > 0 ? (
                  packages.map(pkg => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.name}</TableCell>
                      <TableCell>{pkg.description}</TableCell>
                      <TableCell>{pkg.durationDays} days</TableCell>
                      <TableCell>{pkg.plsCost}</TableCell>
                      <TableCell>
                        {pkg.isActive ? 
                          <Badge className="bg-green-500">Active</Badge> : 
                          <Badge className="bg-gray-500">Inactive</Badge>
                        }
                      </TableCell>
                      <TableCell>{pkg.displayOrder}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleEditPackage(pkg)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">No subscription packages found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        
        <TabsContent value="payments">
          <div className="bg-card rounded-md shadow">
            <Table>
              <TableCaption>History of subscription payments</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Amount (PLS)</TableHead>
                  <TableHead>Transaction Hash</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingPayments ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">Loading payments...</TableCell>
                  </TableRow>
                ) : payments && payments.length > 0 ? (
                  payments.map(payment => (
                    <TableRow key={payment.id}>
                      <TableCell>{payment.userId}</TableCell>
                      <TableCell>{payment.packageId}</TableCell>
                      <TableCell>{payment.plsAmount}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {payment.txHash.slice(0, 8)}...{payment.txHash.slice(-8)}
                      </TableCell>
                      <TableCell>{getStatusBadge(payment.status)}</TableCell>
                      <TableCell>{format(new Date(payment.createdAt), 'PPP')}</TableCell>
                      <TableCell>
                        {payment.status === 'pending' && (
                          <div className="flex space-x-1">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-green-500 hover:text-green-700"
                              onClick={() => handleUpdatePaymentStatus(payment.id, 'confirmed')}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-500 hover:text-red-700"
                              onClick={() => handleUpdatePaymentStatus(payment.id, 'rejected')}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {payment.status !== 'pending' && (
                          <Clock className="h-4 w-4 text-gray-400" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">No payment records found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
      
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? `Edit ${editingPackage.name} Package` : 'Create New Subscription Package'}
            </DialogTitle>
            <DialogDescription>
              {editingPackage 
                ? 'Update the details of this subscription package.' 
                : 'Configure a new subscription package to offer to users.'}
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Package Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Basic, Premium, etc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Brief description of the package benefits" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="durationDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (Days)</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="plsCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PLS Cost</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. 10000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={form.control}
                name="features"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Features</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Enter features, one per line" 
                        {...field} 
                        rows={5}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter each feature on a new line. These will be displayed as bullet points.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="displayOrder"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input type="number" min="0" {...field} />
                      </FormControl>
                      <FormDescription>
                        Lower numbers appear first
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-end space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Active</FormLabel>
                        <FormDescription>
                          Only active packages are displayed to users
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit">
                  {editingPackage ? 'Update Package' : 'Create Package'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}