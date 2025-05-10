import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Helper function to handle response parsing
async function parseResponse<T>(response: Response): Promise<T> {
  const data = await response.json();
  return data as T;
}

export interface SubscriptionPackage {
  id: number;
  name: string;
  description: string;
  durationDays: number;
  plsCost: string;
  features: string[];
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionPayment {
  id: number;
  userId: number;
  packageId: number;
  txHash: string;
  fromAddress: string;
  toAddress: string;
  plsAmount: string;
  status: "pending" | "confirmed" | "rejected";
  startDate: string;
  endDate: string;
  confirmedAt: string;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  package?: SubscriptionPackage;
}

export function useSubscriptionPackages(activeOnly = true) {
  return useQuery<SubscriptionPackage[]>({
    queryKey: ['/api/subscription-packages', { activeOnly }],
    queryFn: async () => {
      const response = await apiRequest(`/api/subscription-packages?activeOnly=${activeOnly}`);
      return parseResponse<SubscriptionPackage[]>(response);
    },
  });
}

export function useSubscriptionPackage(id: number | null) {
  return useQuery<SubscriptionPackage>({
    queryKey: ['/api/subscription-packages', id],
    queryFn: async () => {
      const response = await apiRequest(`/api/subscription-packages/${id}`);
      return parseResponse<SubscriptionPackage>(response);
    },
    enabled: !!id,
  });
}

export function useUserActiveSubscription(userId: number | null) {
  return useQuery<SubscriptionPayment | null>({
    queryKey: ['/api/users', userId, 'subscription'],
    queryFn: async () => {
      const response = await apiRequest(`/api/users/${userId}/subscription`);
      return parseResponse<SubscriptionPayment | null>(response);
    },
    enabled: !!userId,
  });
}

export function useUserSubscriptionHistory(userId: number | null) {
  return useQuery<SubscriptionPayment[]>({
    queryKey: ['/api/users', userId, 'subscription-history'],
    queryFn: async () => {
      const response = await apiRequest(`/api/users/${userId}/subscription-history`);
      return parseResponse<SubscriptionPayment[]>(response);
    },
    enabled: !!userId,
  });
}

export function useSubscriptionPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<SubscriptionPayment, Error, {
    userId: number;
    packageId: number;
    txHash: string;
    fromAddress: string;
    toAddress: string;
    plsAmount: string;
  }>({
    mutationFn: async (paymentData) => {
      const response = await apiRequest('POST', '/api/subscription-payments', paymentData);
      return parseResponse<SubscriptionPayment>(response);
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Payment Submitted",
        description: "Your subscription payment is being processed.",
      });
      
      // Invalidate user subscription queries
      queryClient.invalidateQueries({ 
        queryKey: ['/api/users', variables.userId, 'subscription'] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/users', variables.userId, 'subscription-history'] 
      });
    },
    onError: (error) => {
      toast({
        title: "Payment Failed",
        description: error instanceof Error ? error.message : "Failed to process subscription payment",
        variant: "destructive",
      });
    },
  });
}

// For admin use
export function useUpdateSubscriptionPaymentStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<SubscriptionPayment, Error, { id: number; status: string }>({
    mutationFn: async ({ id, status }) => {
      const response = await apiRequest('PATCH', `/api/subscription-payments/${id}/status`, { status });
      return parseResponse<SubscriptionPayment>(response);
    },
    onSuccess: (data) => {
      toast({
        title: "Status Updated",
        description: `Payment status updated to ${data.status}`,
      });
      
      // Invalidate user subscription queries
      queryClient.invalidateQueries({ 
        queryKey: ['/api/users', data.userId, 'subscription'] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/users', data.userId, 'subscription-history'] 
      });
      
      // Also invalidate the payments list
      queryClient.invalidateQueries({
        queryKey: ['/api/subscription-payments']
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error instanceof Error ? error.message : "Failed to update payment status",
        variant: "destructive",
      });
    },
  });
}

// Helper to check if user has active subscription
export function hasActiveSubscription(subscription: SubscriptionPayment | null | undefined): boolean {
  if (!subscription) return false;
  
  // Check if subscription is confirmed and not expired
  return (
    subscription.status === 'confirmed' && 
    !!subscription.endDate && 
    new Date(subscription.endDate) > new Date()
  );
}