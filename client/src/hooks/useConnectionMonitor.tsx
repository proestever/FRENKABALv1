import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ConnectionStatus {
  isOnline: boolean;
  serverStatus: 'online' | 'offline' | 'checking';
  lastChecked: Date | null;
}

export function useConnectionMonitor() {
  const [status, setStatus] = useState<ConnectionStatus>({
    isOnline: navigator.onLine,
    serverStatus: 'checking',
    lastChecked: null
  });
  
  const { toast } = useToast();

  const checkServerHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (response.ok) {
        const healthData = await response.json();
        setStatus(prev => ({
          ...prev,
          serverStatus: 'online',
          lastChecked: new Date()
        }));
        
        // Log server health in development
        if (process.env.NODE_ENV === 'development') {
          console.log('Server health check:', healthData);
        }
        
        return true;
      } else {
        throw new Error(`Server responded with status: ${response.status}`);
      }
    } catch (error) {
      console.error('Error checking connection:', error);
      setStatus(prev => ({
        ...prev,
        serverStatus: 'offline',
        lastChecked: new Date()
      }));
      return false;
    }
  }, []);

  const handleOnline = useCallback(() => {
    setStatus(prev => ({ ...prev, isOnline: true }));
    checkServerHealth();
    toast({
      title: "Connection restored",
      description: "You're back online!",
      duration: 3000,
    });
  }, [checkServerHealth, toast]);

  const handleOffline = useCallback(() => {
    setStatus(prev => ({ ...prev, isOnline: false, serverStatus: 'offline' }));
    toast({
      title: "Connection lost",
      description: "Check your internet connection",
      variant: "destructive",
      duration: 5000,
    });
  }, [toast]);

  useEffect(() => {
    // Initial server health check
    checkServerHealth();

    // Set up network status listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic server health checks
    const healthCheckInterval = setInterval(checkServerHealth, 30000); // Every 30 seconds

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(healthCheckInterval);
    };
  }, [handleOnline, handleOffline, checkServerHealth]);

  return {
    ...status,
    checkServerHealth,
    isConnected: status.isOnline && status.serverStatus === 'online'
  };
}