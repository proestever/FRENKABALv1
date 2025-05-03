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
    <footer className="backdrop-blur-md bg-black/10 border-t border-white/15 py-6 mt-12">
      <div className="container mx-auto px-4">
        <div className="text-sm text-muted-foreground text-center">
          <p className="mt-1">© {new Date().getFullYear()} FrenKabal. All rights reserved.</p>
        </div>
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
