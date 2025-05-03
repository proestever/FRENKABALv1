import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { FrenKabalLogo } from "@/components/frenklabal-logo";
import { useWallet } from "@/hooks/use-wallet";
import { Wallet, Menu, Loader2 } from "lucide-react";

// Header component
function Header() {
  const { 
    connect, 
    disconnect, 
    isConnected, 
    account, 
    isConnecting 
  } = useWallet();
  const [, setLocation] = useLocation();

  // Format account address for display
  const formatAccount = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Handle logo click to properly reset state when returning to the home page
  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Reset location to home
    setLocation("/");
    // Do not actively remove queries - let the Home component handle its own state
    // This is more efficient than invalidating all wallet queries at once
  };
  
  // Handle Connect wallet click
  const handleConnectClick = async () => {
    // If we're on a wallet address page, first go back to homepage to avoid state conflicts
    const currentPath = String(location);
    const isWalletAddressPage = currentPath.indexOf('/0x') === 0;
    
    if (isWalletAddressPage && !isConnected) {
      console.log("Currently on wallet page, navigating to home before connecting");
      setLocation("/");
      // Small delay to let the navigation complete before connecting
      setTimeout(() => {
        connect();
      }, 100);
    } else {
      // Otherwise connect normally
      connect();
    }
  };

  return (
    <header className="backdrop-blur-md bg-black/10 shadow-md border-b border-white/15 sticky top-0 z-30">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <a 
          href="/" 
          onClick={handleLogoClick} 
          className="flex items-center group cursor-pointer"
        >
          <FrenKabalLogo size="md" className="mr-3 transition-transform duration-200 group-hover:scale-105" />
          <div className="flex items-center">
            <h1 className="text-xl md:text-2xl font-bold text-white group-hover:text-white/90 transition-colors duration-200">FrenKabal</h1>
            <span className="ml-2 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-[4px] uppercase tracking-wider relative bg-black"
                  style={{
                    background: 'linear-gradient(45deg, #00faff, #0088ff, #5500ff, #aa00ff, #ff00aa, #ff0055)',
                    backgroundSize: '200% 200%',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    color: 'transparent',
                    filter: 'brightness(1.3) contrast(1.3) saturate(1.2)',
                    textShadow: '0 0 2px rgba(255,255,255,0.5)',
                    border: 'none',
                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.15), 0 0 4px rgba(85,0,255,0.5)',
                    animation: 'gradient-x 4s ease infinite, beta-glow 2s ease-in-out infinite'
                  }}>
                Beta
            </span>
          </div>
        </a>
        
        <div className="flex space-x-4 items-center">
          <button className="flex p-2 text-white hover:text-white/80 transition-all duration-200 hover:scale-105">
            <Menu className="w-6 h-6" />
          </button>
          
          {isConnected && account ? (
            <button 
              onClick={disconnect}
              className="px-4 py-2 text-sm font-medium relative overflow-hidden border border-white/30 bg-black/20 text-white rounded-md hover:bg-black/30 transition-all focus:outline-none connect-button flex items-center"
            >
              <Wallet className="w-4 h-4 mr-2" />
              {formatAccount(account)}
            </button>
          ) : (
            <button 
              onClick={handleConnectClick}
              disabled={isConnecting}
              className="px-4 py-2 text-sm font-medium relative overflow-hidden border border-white/30 bg-black/20 text-white rounded-md hover:bg-black/30 transition-all focus:outline-none connect-button flex items-center"
            >
              {isConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 mr-2" />
                  Connect
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

// Footer component
function Footer() {
  return (
    <footer className="backdrop-blur-md bg-black/10 border-t border-white/15 py-6 mt-12 relative">
      <div className="container mx-auto px-4">
        <div className="text-sm text-muted-foreground text-center">
          <p className="mt-1">© {new Date().getFullYear()} FrenKabal. All rights reserved.</p>
        </div>
        <a 
          href="https://t.me/frenkabal" 
          target="_blank" 
          rel="noopener noreferrer"
          className="absolute bottom-6 right-6 text-primary/70 hover:text-primary transition-colors flex items-center gap-1"
          title="Join our Telegram Channel"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="hover:scale-110 transition-transform"
          >
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 2c5.519 0 10 4.481 10 10s-4.481 10-10 10S2 17.519 2 12 6.481 2 12 2zm2.412 7.5h-4.799c-2.086 0-3.611 1.443-3.611 3.1 0 1.247.868 2.288 2.04 2.798l-1.222 2.638a.3.3 0 0 0 .353.426l2.753-1.291c.425.09.869.139 1.327.139 2.086 0 3.611-1.443 3.611-3.1v-1.348c0-1.76-1.368-3.362-3.452-3.362zm1.452 4.71c0 1.14-1.033 2.1-2.611 2.1-.364 0-.718-.044-1.049-.122a.3.3 0 0 0-.23.032l-1.631.765.775-1.676a.3.3 0 0 0-.078-.375c-.745-.54-1.188-1.298-1.188-2.124 0-1.14 1.033-2.1 2.611-2.1h3.799c1.38 0 2.452 1.109 2.452 2.362v1.348c0 1.14-1.033 2.1-2.611 2.1h-.039c-1.739 0-3.15-1.34-3.15-2.99v-.34a.3.3 0 0 0-.3-.3h-.788a.3.3 0 0 0-.3.3v.34c0 1.953 1.594 3.59 3.638 3.59h.039c1.77 0 3.211-1.34 3.211-2.99v-1.348c0-1.604-1.338-2.962-3.052-2.962h-3.799c-1.77 0-3.211 1.34-3.211 2.99 0 .905.45 1.704 1.177 2.248l-.566 1.225a.3.3 0 0 0 .407.394l1.101-.516c.358.08.732.123 1.118.123 1.578 0 2.878-1.072 3.078-2.428a.3.3 0 0 0-.297-.337h-.789a.3.3 0 0 0-.3.287c-.116.825-.883 1.478-1.803 1.478-.33 0-.64-.076-.911-.206a.3.3 0 0 0-.345.065l-.306.369.162-.352a.3.3 0 0 0-.174-.397 1.622 1.622 0 0 1-.426-.274c-.389-.337-.6-.825-.6-1.32 0-.94.833-1.7 1.911-1.7h3.799c1.08 0 1.952.76 1.952 1.662v1.348z"/>
          </svg>
        </a>
      </div>
    </footer>
  );
}

function Router() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,150,255,0.25)_0%,transparent_60%),radial-gradient(ellipse_at_bottom,rgba(200,0,255,0.25)_0%,transparent_60%),radial-gradient(circle_at_center,rgba(0,120,255,0.1)_0%,transparent_45%)] pointer-events-none"></div>
      <div className="fixed inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70 pointer-events-none"></div>
      <Header />
      <div className="flex-grow relative z-10">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/:walletAddress" component={Home} />
          <Route component={NotFound} />
        </Switch>
      </div>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
