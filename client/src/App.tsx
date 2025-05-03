import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";

// Header component
function Header() {
  return (
    <header className="bg-card shadow-md border-b border-border">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center">
          <div className="flex items-center bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent mr-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <path d="M18 8V7a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v10a3 3 0 0 0 3 3h1"></path>
              <path d="M14 4v4"></path>
              <path d="M19 10 V16 H15a2 2 0 0 1 0-4h4"></path>
              <path d="M22 16v-5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3"></path>
            </svg>
          </div>
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">PulseChain Wallet Tracker</h1>
        </div>
        
        <div className="flex space-x-4 items-center">
          <button className="hidden md:flex px-4 py-2 text-sm bg-card text-foreground border border-border rounded-md hover:bg-secondary transition">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 mr-1">
              <circle cx="12" cy="12" r="10"></circle>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            Help
          </button>
          <button className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-primary to-accent text-white rounded-md hover:opacity-90 transition focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
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
    <footer className="bg-card border-t border-border py-6 mt-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <div className="flex items-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 mr-2">
                <path d="M18 8V7a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v10a3 3 0 0 0 3 3h1"></path>
                <path d="M14 4v4"></path>
                <path d="M19 10 V16 H15a2 2 0 0 1 0-4h4"></path>
                <path d="M22 16v-5a3 3 0 0 0-3-3h-4a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h5a3 3 0 0 0 3-3"></path>
              </svg>
              <span className="font-semibold">PulseChain Wallet Tracker</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Track any wallet on the PulseChain network</p>
          </div>
          
          <div className="flex gap-x-6">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
              </svg>
            </a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path>
              </svg>
            </a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M18 8.033c-4.9-.7-7.1-.7-12 0"></path>
                <path d="M10 13.667a3 3 0 0 1 4 0"></path>
                <path d="M5.333 17.333C4.063 15.693 3.501 13.582 3.667 11.444c.055-.956.223-1.905.5-2.823.866-2.877 3.5-5.205 3.5-5.205A15.96 15.96 0 0 1 16.333 3.333c0 .055 0 .11.056.167.13 3.342 1.5 7.526 4.078 10.388 0 0-.155 3.117-3.435 3.345-1.401.097-2.593-.72-3.031-1.834 0 0 3.099-.61 3.099-3.061 0-2.451-3.1-2.334-3.1-2.334"></path>
                <path d="M19.667 8.167c.22 2.755-.038 5.519-.962 8.166C16.428 17.666 13.565 18.5 12 18.5c-1.565 0-4.428-.834-6.705-2.167-.924-2.647-1.182-5.411-.962-8.166"></path>
              </svg>
            </a>
          </div>
        </div>
        
        <div className="border-t border-border mt-6 pt-6 text-sm text-muted-foreground text-center">
          <p>Built with PulseChain Scan API and Moralis. This is not a financial tool. Use at your own risk.</p>
          <p className="mt-1">© {new Date().getFullYear()} PulseChain Wallet Tracker. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

function Router() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(120,50,255,0.15),transparent_50%),radial-gradient(ellipse_at_bottom_left,rgba(255,70,200,0.1),transparent_50%)] pointer-events-none"></div>
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
