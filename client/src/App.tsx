import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { FrenKabalLogo } from "@/components/frenklabal-logo";

// Header component
function Header() {
  return (
    <header className="backdrop-blur-md bg-black/10 shadow-md border-b border-white/15 sticky top-0 z-30">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
          <FrenKabalLogo size="md" className="mr-3" />
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-bold text-white">FrenKabal</h1>
            <p className="text-xs md:text-sm text-muted-foreground">PulseChain Wallet Tracker</p>
          </div>
        </div>
        
        <div className="flex space-x-4 items-center">
          <button className="hidden md:flex px-4 py-2 text-sm glass-card border-white/15 rounded-md hover:bg-black/20 transition text-white">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Help
          </button>
          <button className="px-4 py-2 text-sm font-medium relative overflow-hidden border border-white/30 bg-black/20 text-white rounded-md hover:bg-black/30 transition-all focus:outline-none connect-button">
            Connect
          </button>
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
