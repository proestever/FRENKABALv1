import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const BridgeWidget = () => {
  // Add the ChangeNOW widget scripts when the component mounts
  useEffect(() => {
    // Create the iframe
    const iframeEl = document.createElement('iframe');
    iframeEl.id = 'iframe-widget';
    iframeEl.src = 'https://changenow.io/embeds/exchange-widget/v2/widget.html?FAQ=true&amount=0.09&amountFiat=1500&backgroundColor=2B2B35&darkMode=true&from=eth&fromFiat=eur&horizontal=false&isFiat&lang=en-US&link_id=6679e3a02db35c&locales=false&logo=false&primaryColor=00C26F&to=pls&toFiat=eth&toTheMoon=true';
    iframeEl.style.height = '356px';
    iframeEl.style.width = '100%';
    iframeEl.style.border = 'none';
    
    // Get the container and append the iframe
    const widgetContainer = document.getElementById('changenow-widget-container');
    if (widgetContainer) {
      // Clear any existing content first
      widgetContainer.innerHTML = '';
      widgetContainer.appendChild(iframeEl);
    }
    
    // Add the connector script
    const script = document.createElement('script');
    script.defer = true;
    script.type = 'text/javascript';
    script.src = 'https://changenow.io/embeds/exchange-widget/v2/stepper-connector.js';
    document.body.appendChild(script);
    
    // Cleanup when component unmounts
    return () => {
      if (widgetContainer) {
        widgetContainer.innerHTML = '';
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-white">Bridge</h1>
        <p className="text-muted-foreground mb-3">
          Easily exchange your assets across different networks with ChangeNOW integration. 
          No registration required, simple and fast.
        </p>
        
        <div className="mb-6 flex justify-end">
          <a 
            href="/bridge" 
            className="text-sm text-primary hover:underline"
          >
            ← Return to standard exchange interface
          </a>
        </div>
        
        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Crypto Exchange</CardTitle>
            <CardDescription>Secure, fast, and non-custodial exchanges</CardDescription>
          </CardHeader>
          
          <CardContent>
            <div id="changenow-widget-container" className="w-full"></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BridgeWidget;