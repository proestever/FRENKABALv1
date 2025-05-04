import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { TokenLogo } from '@/components/token-logo';
import { useAuth } from '@/providers/auth-provider';
import { Loader2, ExternalLink, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, shortenAddress } from '@/lib/format';
import plsLogo from '@assets/pls logo trimmed.png';

// Type definitions
interface Donor {
  address: string;
  totalDonated: number;
  donations: Donation[];
  rank?: number;
}

interface Donation {
  txHash: string;
  tokenAddress: string;
  tokenSymbol: string;
  amount: string;
  valueUsd: number;
  timestamp: number;
}

const DONATIONS_ADDRESS = '0x87315173fC0B7A3766761C8d199B803697179434';

export function Donations() {
  const { toast } = useToast();
  const { isConnected, account } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [topDonor, setTopDonor] = useState<Donor | null>(null);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [userDonationRank, setUserDonationRank] = useState<number | null>(null);
  const [userTotalDonated, setUserTotalDonated] = useState<number>(0);

  // Fetch donation data
  useEffect(() => {
    const fetchDonationData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Make API call to fetch donation data
        const response = await fetch(`/api/donations/${DONATIONS_ADDRESS}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch donation data');
        }
        
        // Get donation records from API
        const donationRecords = await response.json();
        
        // Map the API response to our Donor type
        const mappedDonors: Donor[] = donationRecords.map((record: any) => ({
          address: record.donorAddress,
          totalDonated: record.totalValueUsd,
          donations: record.donations.map((donation: any) => ({
            txHash: donation.txHash,
            tokenAddress: donation.tokenAddress,
            tokenSymbol: donation.tokenSymbol || 'Unknown',
            amount: donation.amount,
            valueUsd: donation.valueUsd,
            timestamp: donation.timestamp
          })),
          rank: record.rank
        }));
        
        // If no donations found yet, use an empty array
        const processedDonors = mappedDonors.length > 0 ? mappedDonors : [];
        
        // Set top donor if available
        if (processedDonors.length > 0) {
          setTopDonor(processedDonors[0]);
        }
        
        // Set all donors
        setDonors(processedDonors);
        
        // If user is connected, find their rank
        if (isConnected && account) {
          const userDonor = processedDonors.find(
            donor => donor.address.toLowerCase() === account.toLowerCase()
          );
          
          if (userDonor) {
            setUserDonationRank(userDonor.rank || null);
            setUserTotalDonated(userDonor.totalDonated);
          } else {
            setUserDonationRank(null);
            setUserTotalDonated(0);
          }
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('Error fetching donation data:', err);
        setError('Failed to load donation data. Please try again later.');
        setIsLoading(false);
      }
    };
    
    fetchDonationData();
  }, [isConnected, account]);
  
  const copyAddressToClipboard = () => {
    navigator.clipboard.writeText(DONATIONS_ADDRESS);
    setCopiedAddress(true);
    
    setTimeout(() => {
      setCopiedAddress(false);
    }, 2000);
    
    toast({
      title: 'Address Copied',
      description: 'Donation address copied to clipboard',
    });
  };
  
  const openInExplorer = () => {
    window.open(`https://scan.pulsechain.com/address/${DONATIONS_ADDRESS}`, '_blank');
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-10 px-4">
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <h3 className="text-xl font-medium mt-2">Loading donation data...</h3>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto py-10 px-4">
        <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 text-center">
          <h3 className="text-xl font-medium mb-2">Error</h3>
          <p>{error}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 px-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-clip-text text-transparent bg-gradient-to-r from-purple-500 via-pink-500 to-red-500">
          Support FrenKabal Development
        </h1>
        <p className="text-lg text-gray-300 mb-6 max-w-3xl mx-auto">
          Your contributions help keep this service free for everyone. 
          All donations go directly toward hosting, development, and new features.
        </p>
      </div>
      
      {/* Two column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Left column - Donation address */}
        <div className="glass-card bg-black/20 border border-white/15 p-6 rounded-xl backdrop-blur-md">
          <h2 className="text-xl font-semibold mb-4">Donation Address</h2>
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-black/30 text-white rounded-md p-3 font-mono text-sm break-all">
              {DONATIONS_ADDRESS}
            </div>
            <Button 
              size="icon" 
              variant="ghost" 
              onClick={copyAddressToClipboard}
              className="transition-all hover:scale-105 shrink-0"
            >
              {copiedAddress ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
            </Button>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              className="transition-all hover:scale-105"
              onClick={openInExplorer}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Explorer
            </Button>
            
            {isConnected && (
              <Button 
                className="transition-all hover:scale-105"
                onClick={() => {
                  toast({
                    title: "Send tokens directly from your wallet",
                    description: "Coming soon!",
                  });
                }}
              >
                Donate Now
              </Button>
            )}
          </div>
          
          {/* Accepted tokens */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <h3 className="text-lg font-semibold mb-3">Accepted Tokens</h3>
            <p className="text-white/70 mb-4 text-sm">
              We accept PLS and any ERC-20 token on PulseChain.
            </p>
            
            <div className="flex flex-wrap gap-3">
              <div className="glass-card bg-black/30 border border-white/10 p-2 rounded-lg flex items-center">
                <img src={plsLogo} alt="PLS" className="w-8 h-8 object-contain mr-2" />
                <span>PLS</span>
              </div>
              
              <div className="glass-card bg-black/30 border border-white/10 p-2 rounded-lg flex items-center">
                <TokenLogo address="0xCA9bA905926e4592632d11827EDC47607C92e585" symbol="DAI" size="sm" />
                <span className="ml-2">DAI</span>
              </div>
              
              <div className="glass-card bg-black/30 border border-white/10 p-2 rounded-lg flex items-center">
                <TokenLogo address="0x95B303987A60C71504D99Aa1b13B4DA07b0790ab" symbol="PLSX" size="sm" />
                <span className="ml-2">PLSX</span>
              </div>
              
              <div className="glass-card bg-black/30 border border-white/10 p-2 rounded-lg flex items-center">
                <TokenLogo address="0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39" symbol="HEX" size="sm" />
                <span className="ml-2">HEX</span>
              </div>
              
              <div className="glass-card bg-black/30 border border-white/10 p-2 rounded-lg flex items-center opacity-80">
                <span className="text-lg mr-1">+</span>
                <span className="text-xs">Any ERC-20</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Right column - Top donor highlight */}
        <div>
          {topDonor && (
            <Card className="glass-card bg-gradient-to-br from-amber-500/10 to-yellow-500/20 border border-yellow-500/25 backdrop-blur-md overflow-hidden mb-4">
              <div className="absolute top-0 right-0 m-4">
                <Badge className="bg-yellow-500 hover:bg-yellow-600">Top Donor</Badge>
              </div>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <span className="text-2xl font-bold text-yellow-400">👑 {shortenAddress(topDonor.address)}</span>
                </CardTitle>
                <CardDescription>
                  <span className="text-white/80">Our biggest supporter - thank you!</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-yellow-300 to-amber-500">
                  {formatCurrency(topDonor.totalDonated)}
                </p>
                <p className="text-sm text-white/60 mt-1">
                  Total donations: {topDonor.donations.length}
                </p>
              </CardContent>
            </Card>
          )}
          
          {/* Top 2-3 donors side by side */}
          <div className="grid grid-cols-2 gap-4">
            {donors.slice(1, 3).map((donor) => (
              <Card key={donor.address} className="glass-card bg-black/30 border border-white/15 backdrop-blur-md">
                <div className="absolute top-0 right-0 m-2">
                  <Badge variant="outline" className="text-xs">#{donor.rank}</Badge>
                </div>
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-base">{shortenAddress(donor.address)}</CardTitle>
                  <CardDescription className="text-xs">Top Donor</CardDescription>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <p className="text-lg font-bold">{formatCurrency(donor.totalDonated)}</p>
                  <p className="text-xs text-white/60">
                    {donor.donations.length} donation{donor.donations.length !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
            
            {/* Placeholders for top 2-3 if not available */}
            {donors.length < 2 && (
              <Card className="glass-card bg-black/10 border border-white/5 backdrop-blur-md">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-base text-white/40">Waiting for donor</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <p className="text-lg font-bold text-white/40">$0.00</p>
                </CardContent>
              </Card>
            )}
            
            {donors.length < 3 && donors.length >= 2 && (
              <Card className="glass-card bg-black/10 border border-white/5 backdrop-blur-md">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-base text-white/40">Waiting for donor</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <p className="text-lg font-bold text-white/40">$0.00</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
      
      {/* Donor leaderboard - Full width */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Donation Leaderboard</h2>
        <div className="glass-card bg-black/20 border border-white/15 backdrop-blur-md rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="text-left py-3 px-4">Rank</th>
                  <th className="text-left py-3 px-4">Address</th>
                  <th className="text-left py-3 px-4">Total Donated</th>
                  <th className="text-left py-3 px-4">Last Donation</th>
                </tr>
              </thead>
              <tbody>
                {donors.map((donor, index) => (
                  <tr 
                    key={donor.address} 
                    className={`
                      border-b border-white/5 hover:bg-white/5 transition-colors
                      ${account && donor.address.toLowerCase() === account.toLowerCase() ? 'bg-blue-500/10' : ''}
                    `}
                  >
                    <td className="py-3 px-4">
                      {index < 3 ? (
                        <span className="flex items-center">
                          {index === 0 ? (
                            <span className="text-yellow-400 text-lg mr-1">👑</span>
                          ) : index === 1 ? (
                            <span className="text-gray-300 text-lg mr-1">🥈</span>
                          ) : (
                            <span className="text-amber-700 text-lg mr-1">🥉</span>
                          )}
                          #{index + 1}
                        </span>
                      ) : `#${index + 1}`}
                    </td>
                    <td className="py-3 px-4 font-mono">{shortenAddress(donor.address)}</td>
                    <td className="py-3 px-4 font-bold">{formatCurrency(donor.totalDonated)}</td>
                    <td className="py-3 px-4 text-white/70">
                      {new Date(donor.donations[0].timestamp).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
                
                {/* If no donors yet, show placeholder */}
                {donors.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-white/50">
                      No donations yet. Be the first to donate!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Donations;