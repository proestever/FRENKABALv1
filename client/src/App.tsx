import React from "react";
import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import { Profile } from "@/pages/profile";
import { Donations } from "@/pages/donations";
import PortfoliosPage from "@/pages/portfolios";
import AdminPage from "@/pages/admin";
import ApiUsagePage from "@/pages/api-usage";
import Credits from "@/pages/Credits";
import AdminCredits from "@/pages/Admin/Credits";
import SubscriptionPage from "@/pages/Subscription";
import { FrenKabalLogo } from "@/components/frenklabal-logo";
import { useAuth } from "@/providers/auth-provider";
import { AuthProvider } from "@/providers/auth-provider";
import { CreditBalance } from "@/components/credit-balance";
import { Wallet, Menu, Loader2, Home as HomeIcon, Bookmark, HeartHandshake, FolderSearch, Settings, BarChart, CircleDollarSign, CreditCard } from "lucide-react";
import telegramLogo from "@assets/Telegram_2019_Logo.svg.png";
import xLogo from "@assets/X_logo.jpg";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Header component
function Header() {
  const { 
    connect, 
    disconnect, 
    isConnected, 
    account, 
    isConnecting 
  } = useAuth();
  const [, setLocation] = useLocation();

  // Format account address for display
  const formatAccount = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Handle logo click to properly reset state when returning to the home page
  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    
    // Clear any session storage portfolio data to ensure complete state reset
    const sessionKeys = Object.keys(sessionStorage);
    sessionKeys.forEach(key => {
      if (key.startsWith('portfolio_')) {
        sessionStorage.removeItem(key);
      }
    });
    
    // Reset location to home
    setLocation("/");
    
    // Delay a bit to ensure the Home component reloads with a fresh state
    setTimeout(() => {
      // Force a reset of any search-related states in UI components
      window.dispatchEvent(new CustomEvent('frenklabal:reset-search'));
    }, 50);
  };
  
  // Handle Connect wallet click
  const handleConnectClick = async () => {
    console.log("handleConnectClick triggered", Date.now());
    try {
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
        console.log("Calling connect() directly");
        await connect();
      }
    } catch (error) {
      console.error("Error in handleConnectClick:", error);
    }
  };

  // Define button styles with responsive variants
  const getButtonClass = (isMobile = false) => {
    return `${isMobile ? 'px-2 py-1 text-xs' : 'px-4 py-2 text-sm'} font-medium relative overflow-hidden border border-white/30 bg-black/20 text-white rounded-md hover:bg-black/30 transition-all focus:outline-none connect-button flex items-center`;
  };

  // Connected/disconnected button logic for desktop and mobile
  const renderConnectButton = (isMobile = false) => {
    const iconSize = isMobile ? "w-3 h-3 mr-1" : "w-4 h-4 mr-2";
    
    if (isConnected && account) {
      return (
        <button 
          onClick={() => {
            console.log("Disconnect button clicked");
            disconnect();
          }}
          className={getButtonClass(isMobile)}
        >
          <Wallet className={iconSize} />
          {formatAccount(account)}
        </button>
      );
    } else {
      return (
        <button 
          onClick={() => {
            console.log("Connect button clicked");
            handleConnectClick();
          }}
          disabled={isConnecting}
          className={getButtonClass(isMobile)}
        >
          {isConnecting ? (
            <>
              <Loader2 className={`${iconSize} animate-spin`} />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Wallet className={iconSize} />
              <span>Connect</span>
            </>
          )}
        </button>
      );
    }
  };

  return (
    <header className="backdrop-blur-md bg-black/10 shadow-md border-b border-white/15 sticky top-0 z-30">
      {/* Desktop header */}
      <div className="container mx-auto px-4 py-3 hidden md:flex items-center justify-between">
        <a 
          href="#" 
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
          {isConnected && <CreditBalance />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex p-2 text-white hover:text-white/80 transition-all duration-200 hover:scale-105">
                <Menu className="w-6 h-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 glass-card bg-black/90 border border-white/10">
              <DropdownMenuItem onClick={() => setLocation("/")} className="cursor-pointer dropdown-item-hover">
                <HomeIcon className="mr-2 h-4 w-4" />
                <span>Home</span>
              </DropdownMenuItem>
              
              <DropdownMenuItem onClick={() => setLocation("/donations")} className="cursor-pointer dropdown-item-hover">
                <HeartHandshake className="mr-2 h-4 w-4" />
                <span>Donations</span>
              </DropdownMenuItem>
              
              {isConnected && (
                <>
                  <DropdownMenuItem onClick={() => setLocation("/saved")} className="cursor-pointer dropdown-item-hover">
                    <Bookmark className="mr-2 h-4 w-4" />
                    <span>Saved Addresses</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => setLocation("/portfolios")} className="cursor-pointer dropdown-item-hover">
                    <FolderSearch className="mr-2 h-4 w-4" />
                    <span>Portfolios</span>
                  </DropdownMenuItem>
                  
                  {/* Admin link - only show for the admin wallet address */}
                  <DropdownMenuItem onClick={() => setLocation("/subscription")} className="cursor-pointer dropdown-item-hover">
                    <CreditCard className="mr-2 h-4 w-4" />
                    <span>Subscription</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => setLocation("/credits")} className="cursor-pointer dropdown-item-hover">
                    <CircleDollarSign className="mr-2 h-4 w-4" />
                    <span>Credits</span>
                  </DropdownMenuItem>
                  
                  {account && account.toLowerCase() === '0x592139a3f8cf019f628a152fc1262b8aef5b7199'.toLowerCase() && (
                    <DropdownMenuItem onClick={() => setLocation("/admin")} className="cursor-pointer dropdown-item-hover">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Admin</span>
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {renderConnectButton(false)}
        </div>
      </div>
      
      {/* Mobile header */}
      <div className="container mx-auto px-4 py-3 md:hidden">
        <div className="grid grid-cols-3 items-center">
          {/* Left area: logo */}
          <div className="col-span-1 flex items-center">
            <a 
              href="#" 
              onClick={handleLogoClick} 
              className="flex items-center group cursor-pointer"
            >
              <FrenKabalLogo size="md" className="transition-transform duration-200 group-hover:scale-105" />
            </a>
          </div>
          
          {/* Center area: connect wallet button */}
          <div className="col-span-1 flex justify-center">
            {renderConnectButton(true)}
          </div>
          
          {/* Right area: credit balance and menu button */}
          <div className="col-span-1 flex justify-end space-x-2 items-center">
            {isConnected && <CreditBalance />}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex p-2 text-white hover:text-white/80 transition-all duration-200 hover:scale-105">
                  <Menu className="w-6 h-6" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 glass-card bg-black/90 border border-white/10">
                <DropdownMenuItem onClick={() => setLocation("/")} className="cursor-pointer dropdown-item-hover">
                  <HomeIcon className="mr-2 h-4 w-4" />
                  <span>Home</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => setLocation("/donations")} className="cursor-pointer dropdown-item-hover">
                  <HeartHandshake className="mr-2 h-4 w-4" />
                  <span>Donations</span>
                </DropdownMenuItem>
                
                {isConnected && (
                  <>
                    <DropdownMenuItem onClick={() => setLocation("/saved")} className="cursor-pointer dropdown-item-hover">
                      <Bookmark className="mr-2 h-4 w-4" />
                      <span>Saved Addresses</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => setLocation("/portfolios")} className="cursor-pointer dropdown-item-hover">
                      <FolderSearch className="mr-2 h-4 w-4" />
                      <span>Portfolios</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => setLocation("/subscription")} className="cursor-pointer dropdown-item-hover">
                      <CreditCard className="mr-2 h-4 w-4" />
                      <span>Subscription</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => setLocation("/credits")} className="cursor-pointer dropdown-item-hover">
                      <CircleDollarSign className="mr-2 h-4 w-4" />
                      <span>Credits</span>
                    </DropdownMenuItem>
                    
                    {/* Admin link in mobile menu - only show for the admin wallet address */}
                    {account && account.toLowerCase() === '0x592139a3f8cf019f628a152fc1262b8aef5b7199'.toLowerCase() && (
                      <DropdownMenuItem onClick={() => setLocation("/admin")} className="cursor-pointer dropdown-item-hover">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Admin</span>
                      </DropdownMenuItem>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
        {/* For desktop: centered text with absolute positioned social icons */}
        <div className="hidden md:block">
          <div className="text-sm text-muted-foreground text-center">
            <p className="mt-1">© {new Date().getFullYear()} FrenKabal. All rights reserved.</p>
          </div>
          <div className="absolute top-1/2 -translate-y-1/2 right-6 flex gap-2.5">
            <a 
              href="https://t.me/frenkabal" 
              target="_blank" 
              rel="noopener noreferrer"
              className="transition-all hover:scale-110 bg-black/30 hover:bg-black/40 p-1 rounded-full overflow-hidden flex items-center justify-center"
              title="Join our Telegram Channel"
            >
              <img 
                src={telegramLogo} 
                alt="Telegram" 
                className="w-6 h-6 object-contain" 
              />
            </a>
            <a 
              href="https://x.com/giga_pls" 
              target="_blank" 
              rel="noopener noreferrer"
              className="transition-all hover:scale-110 bg-black/30 hover:bg-black/40 p-1 rounded-full overflow-hidden flex items-center justify-center"
              title="Follow @giga_pls on X (Twitter)"
            >
              <img 
                src={xLogo} 
                alt="X (Twitter)" 
                className="w-6 h-6 object-contain"
              />
            </a>
          </div>
        </div>
        
        {/* For mobile: flex layout with left-aligned text and right-aligned social icons */}
        <div className="md:hidden flex justify-between items-center">
          <div className="text-sm text-muted-foreground text-left">
            <p>© {new Date().getFullYear()} FrenKabal. All rights reserved.</p>
          </div>
          <div className="flex gap-2.5">
            <a 
              href="https://t.me/frenkabal" 
              target="_blank" 
              rel="noopener noreferrer"
              className="transition-all hover:scale-110 bg-black/30 hover:bg-black/40 p-1 rounded-full overflow-hidden flex items-center justify-center"
              title="Join our Telegram Channel"
            >
              <img 
                src={telegramLogo} 
                alt="Telegram" 
                className="w-6 h-6 object-contain" 
              />
            </a>
            <a 
              href="https://x.com/giga_pls" 
              target="_blank" 
              rel="noopener noreferrer"
              className="transition-all hover:scale-110 bg-black/30 hover:bg-black/40 p-1 rounded-full overflow-hidden flex items-center justify-center"
              title="Follow @giga_pls on X (Twitter)"
            >
              <img 
                src={xLogo} 
                alt="X (Twitter)" 
                className="w-6 h-6 object-contain"
              />
            </a>
          </div>
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
          <Route path="/profile" component={Profile} />
          <Route path="/saved" component={Profile} />
          <Route path="/portfolios" component={PortfoliosPage} />
          <Route path="/portfolio/:portfolioId" component={Home} />
          <Route path="/donations" component={Donations} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/admin/api-usage" component={ApiUsagePage} />
          <Route path="/admin/credits" component={AdminCredits} />
          <Route path="/admin/subscriptions">
            {() => {
              const AdminSubscriptions = React.lazy(() => import('@/pages/Admin/Subscriptions'));
              return (
                <React.Suspense fallback={<div>Loading...</div>}>
                  <AdminSubscriptions />
                </React.Suspense>
              );
            }}
          </Route>
          <Route path="/credits" component={Credits} />
          <Route path="/subscription" component={SubscriptionPage} />
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
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
