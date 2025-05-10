import { useCredits } from '@/hooks/use-credits';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CircleDollarSign } from 'lucide-react';
import { useLocation } from 'wouter';
import { useMobile } from '@/hooks/use-mobile';

/**
 * Displays the user's current credit balance
 */
export function CreditBalance() {
  const { credits, isLoading } = useCredits();
  const [, setLocation] = useLocation();
  const isMobile = useMobile();
  
  // Format large numbers with commas
  const formatNumber = (num: number) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };

  // Show nothing if not logged in or if loading
  if (isLoading || !credits) {
    return null;
  }

  // Mobile version - more compact
  if (isMobile) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button 
            onClick={() => setLocation('/credits')}
            className="flex items-center px-2 py-1 rounded-md bg-gradient-to-r from-indigo-600/30 to-blue-500/20 border border-blue-500/40 hover:bg-blue-400/30 transition-all"
          >
            <CircleDollarSign className="w-3.5 h-3.5 text-blue-300" />
            <span className="text-xs font-medium text-blue-100 ml-1">
              {formatNumber(credits.balance)}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p>Current balance: {formatNumber(credits.balance)} credits</p>
            <p>Click to manage credits</p>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  // Desktop version
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button 
          onClick={() => setLocation('/credits')}
          className="flex items-center space-x-1 px-3 py-1.5 rounded-md bg-gradient-to-r from-indigo-600/30 to-blue-500/20 border border-blue-500/40 hover:bg-blue-400/30 transition-all"
        >
          <CircleDollarSign className="w-4 h-4 text-blue-300" />
          <span className="text-sm font-medium text-blue-100">
            {formatNumber(credits.balance)} credits
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <p>Current balance: {formatNumber(credits.balance)} credits</p>
          <p>Lifetime earned: {formatNumber(credits.lifetimeCredits)} credits</p>
          <p>Lifetime spent: {formatNumber(credits.lifetimeSpent)} credits</p>
          <p className="mt-1 text-blue-300 italic">Click to manage credits</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}