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
          <button className="px-4 py-2 text-sm font-medium relative glass-highlight overflow-hidden border border-transparent bg-gradient-to-r from-[rgba(255,0,150,0.8)] to-[rgba(0,150,255,0.8)] text-white rounded-md hover:opacity-90 transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
            Connect Wallet
          </button>
        </div>
      </div>
    </header>
  );
}

// Footer component
function Footer() {
  return (
    <footer className="backdrop-blur-md bg-black/10 border-t border-white/15 py-6 mt-12 glass-highlight">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0 flex items-center">
            <FrenKabalLogo size="sm" className="mr-3" />
            <div>
              <div className="flex items-center">
                <span className="font-semibold text-white">FrenKabal</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Track any wallet on the PulseChain network</p>
            </div>
          </div>
          
          <div className="flex gap-x-3">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-white glass-card p-2 rounded-full border-white/15 hover:bg-black/20 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
              </svg>
            </a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-white glass-card p-2 rounded-full border-white/15 hover:bg-black/20 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
              </svg>
            </a>
            <a href="https://t.me/frenkabal" target="_blank" rel="noopener noreferrer" className="text-white glass-card p-2 rounded-full border-white/15 hover:bg-black/20 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M21.5 8.9L4.2 16.8c-1.2.6-1.5 1.4-.3 1.9l4.3 1.3 1.7 5.5c.2.6.8.8 1.2.4l2.2-2 4.5 3.4c.9.7 1.9.3 2.2-1l4-19.3c.3-1.7-.7-2.4-2.5-1.1z" />
              </svg>
            </a>
          </div>
        </div>
        
        <div className="border-t border-white/10 mt-6 pt-6 text-sm text-muted-foreground text-center">
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
