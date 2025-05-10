import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  return useQuery({
    queryKey: ['/api/subscription-packages', { activeOnly }],
    queryFn: () => apiRequest(`/api/subscription-packages?activeOnly=${activeOnly}`),
  });
}

export function useSubscriptionPackage(id: number | null) {
  return useQuery({
    queryKey: ['/api/subscription-packages', id],
    queryFn: () => apiRequest(`/api/subscription-packages/${id}`),
    enabled: !!id,
  });
}

export function useUserActiveSubscription(userId: number | null) {
  return useQuery({
    queryKey: ['/api/users', userId, 'subscription'],
    queryFn: () => apiRequest(`/api/users/${userId}/subscription`),
    enabled: !!userId,
  });
}

export function useUserSubscriptionHistory(userId: number | null) {
  return useQuery({
    queryKey: ['/api/users', userId, 'subscription-history'],
    queryFn: () => apiRequest(`/api/users/${userId}/subscription-history`),
    enabled: !!userId,
  });
}

export function useSubscriptionPayment() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (paymentData: {
      userId: number;
      packageId: number;
      txHash: string;
      fromAddress: string;
      toAddress: string;
      plsAmount: string;
    }) => {
      return apiRequest('POST', '/api/subscription-payments', paymentData);
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

  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => {
      return apiRequest('PATCH', `/api/subscription-payments/${id}/status`, { status });
    },
    onSuccess: (data) => {
      toast({
        title: "Status Updated",
        description: `Payment status updated to ${data.status}`,
      });
      
      // Invalidate user subscription queries
      if (data.userId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/users', data.userId, 'subscription'] 
        });
        queryClient.invalidateQueries({ 
          queryKey: ['/api/users', data.userId, 'subscription-history'] 
        });
      }
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