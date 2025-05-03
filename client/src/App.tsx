import { Switch, Route } from "wouter";
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

  // Format account address for display
  const formatAccount = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <header className="backdrop-blur-md bg-black/10 shadow-md border-b border-white/15 sticky top-0 z-30">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <FrenKabalLogo size="md" className="mr-3" />
          <div className="flex items-center">
            <h1 className="text-xl md:text-2xl font-bold text-white">FrenKabal</h1>
            <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded bg-gradient-to-r from-[#e81cff] via-[#40c9ff] to-[#e81cff] bg-size-200 animate-gradient-x text-white uppercase tracking-wider shadow-lg border border-white/20" style={{textShadow: '0 1px 2px rgba(0,0,0,0.3)'}}>Beta</span>
          </div>
        </div>
        
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
              onClick={connect}
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
          <p>Built with PulseChain Scan API and Moralis. This is not a financial tool. Use at your own risk.</p>
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
