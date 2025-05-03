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
          className="absolute bottom-6 right-6 transition-all hover:scale-110 text-white/90 hover:text-white bg-black/30 hover:bg-primary/20 p-2 rounded-full"
          title="Join our Telegram Channel"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="32" 
            height="32" 
            viewBox="0 0 24 24" 
            fill="currentColor"
            className="w-7 h-7"
          >
            <path d="M12,0c-6.627,0 -12,5.373 -12,12c0,6.627 5.373,12 12,12c6.627,0 12,-5.373 12,-12c0,-6.627 -5.373,-12 -12,-12Zm0,2c5.514,0 10,4.486 10,10c0,5.514 -4.486,10 -10,10c-5.514,0 -10,-4.486 -10,-10c0,-5.514 4.486,-10 10,-10Zm2.692,7.124c-0.074,-0.629 -0.419,-0.979 -1.02,-1.046c-0.212,-0.021 -0.414,0.001 -0.544,0.138c-0.05,0.053 -0.097,0.108 -0.139,0.166c-0.444,0.599 -0.881,1.202 -1.329,1.796c-0.175,0.233 -0.347,0.47 -0.533,0.689c-0.099,0.118 -0.207,0.137 -0.311,0.041c-0.117,-0.11 -0.223,-0.231 -0.334,-0.346c-0.611,-0.62 -1.219,-1.243 -1.832,-1.862c-0.108,-0.109 -0.218,-0.128 -0.355,-0.084c-0.397,0.126 -0.707,0.354 -0.92,0.706c-0.289,0.479 -0.214,0.953 0.219,1.327c0.179,0.154 0.371,0.292 0.566,0.426c0.645,0.446 1.294,0.886 1.939,1.334c0.366,0.254 0.73,0.509 1.092,0.769c0.221,0.157 0.217,0.226 0.055,0.429c-0.667,0.835 -1.344,1.663 -2.015,2.496c-0.264,0.329 -0.528,0.658 -0.791,0.989c-0.109,0.137 -0.12,0.218 0.023,0.345c0.182,0.163 0.395,0.242 0.634,0.259c0.326,0.024 0.597,-0.112 0.83,-0.315c0.296,-0.258 0.542,-0.562 0.772,-0.876c0.311,-0.428 0.622,-0.857 0.936,-1.282c0.049,-0.067 0.109,-0.125 0.172,-0.177c0.077,-0.063 0.152,-0.05 0.218,0.024c0.097,0.107 0.183,0.228 0.282,0.334c0.465,0.497 0.93,0.995 1.398,1.489c0.156,0.164 0.334,0.305 0.524,0.423c0.357,0.222 0.738,0.297 1.147,0.202c0.367,-0.086 0.636,-0.29 0.808,-0.628c0.118,-0.232 0.149,-0.479 0.107,-0.731c-0.014,-0.087 -0.055,-0.171 -0.089,-0.255c-0.095,-0.238 -0.232,-0.455 -0.378,-0.666c-0.393,-0.569 -0.795,-1.131 -1.185,-1.702c-0.121,-0.179 -0.122,-0.299 0.018,-0.471c0.614,-0.755 1.218,-1.518 1.812,-2.287c0.127,-0.165 0.277,-0.316 0.395,-0.488c0.062,-0.09 0.118,-0.235 0.092,-0.322Z" />
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
