import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

// Define interface for component props
interface CaptchaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

const CaptchaDialog: React.FC<CaptchaDialogProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Initialize Cloudflare Turnstile when component mounts
  useEffect(() => {
    setIsMounted(true);
    
    // Load Cloudflare Turnstile script if it's not already loaded
    if (!document.getElementById('turnstile-script')) {
      const script = document.createElement('script');
      script.id = 'turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      
      return () => {
        // Clean up script when component unmounts
        const scriptElement = document.getElementById('turnstile-script');
        if (scriptElement) {
          document.head.removeChild(scriptElement);
        }
      };
    }
  }, []);
  
  // Function to render the Turnstile widget
  useEffect(() => {
    if (!isMounted || !isOpen) return;
    
    // Clear any previous errors
    setError(null);
    
    // Define callback functions
    // @ts-ignore - window.turnstile is added by the Cloudflare script
    if (window.turnstile && isOpen) {
      const turnstileSiteKey = process.env.VITE_CLOUDFLARE_TURNSTILE_SITE_KEY || 
                              '1x00000000000000000000AA'; // Demo key for development
      
      setTimeout(() => {
        try {
          // Render the widget
          // @ts-ignore - window.turnstile is added by the Cloudflare script
          window.turnstile.render('#turnstile-container', {
            sitekey: turnstileSiteKey,
            callback: function(token: string) {
              console.log('Turnstile verified successfully, token:', token);
              onSuccess(token);
            },
            'error-callback': function() {
              setError('Verification failed. Please try again.');
              setIsLoading(false);
            },
            'expired-callback': function() {
              setError('Verification expired. Please try again.');
              setIsLoading(false);
            }
          });
        } catch (err) {
          console.error('Error rendering Turnstile:', err);
          setError('Failed to load CAPTCHA. Please refresh the page and try again.');
          setIsLoading(false);
        }
      }, 500);
    }
    
    return () => {
      // Reset container when dialog closes
      const container = document.getElementById('turnstile-container');
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [isMounted, isOpen, onSuccess]);
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Verify you're human</DialogTitle>
          <DialogDescription>
            To protect our API from abuse, please complete the verification below.
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col items-center space-y-4 py-4">
          {error && (
            <Alert variant="destructive" className="w-full">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div 
            id="turnstile-container" 
            className="flex justify-center my-4"
            aria-label="CAPTCHA verification"
          />
          
          <div className="text-xs text-gray-500 mt-2 text-center">
            This site is protected by Cloudflare Turnstile
          </div>
        </div>
        
        <div className="flex justify-end">
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CaptchaDialog;