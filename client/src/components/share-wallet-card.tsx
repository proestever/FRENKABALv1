import React, { useRef, useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatTokenAmount } from '@/lib/utils';
import { TokenLogo } from '@/components/token-logo';
import { Wallet } from '@shared/schema';
import { ProcessedToken } from 'server/types';
import { Share2, Download, Twitter, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { saveAs } from 'file-saver';
import plsLogo from '../assets/pls-logo-optimized.png';
import frenkabalLogo from '../assets/frenklabal_logo.png';
import { HexStakeSummary } from '@/hooks/use-hex-stakes';
import { useToast } from '@/hooks/use-toast';

interface ShareWalletCardProps {
  wallet: Wallet;
  portfolioName?: string;
  tokens: ProcessedToken[];
  hexStakesSummary?: HexStakeSummary | null;
}

export function ShareWalletCard({ wallet, portfolioName, tokens, hexStakesSummary }: ShareWalletCardProps) {
  // Reference to the card element we want to capture
  const cardRef = useRef<HTMLDivElement>(null);

  // Sort tokens by value in descending order and take top 5
  const top5Tokens = [...tokens]
    .filter(token => token.value && token.value > 0)
    .sort((a, b) => (b.value || 0) - (a.value || 0))
    .slice(0, 5);

  const { toast } = useToast();
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [tokenImages, setTokenImages] = useState<Record<string, HTMLImageElement>>({});
  const [fkLogoImg, setFkLogoImg] = useState<HTMLImageElement | null>(null);
  const [plsLogoImg, setPlsLogoImg] = useState<HTMLImageElement | null>(null);
  
  // No need to load images, we'll use colored circles with token symbols
  useEffect(() => {
    setIsGeneratingImage(false);
  }, [tokens]);
  
  // Generate share image and save using a large format canvas with actual logos
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    
    setIsGeneratingImage(true);
    
    try {
      // Create a canvas with fixed dimensions for better quality
      const canvas = document.createElement('canvas');
      // Wider aspect ratio for better readability
      canvas.width = 1200;
      canvas.height = 800;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error("Could not get canvas context");
      }
      
      // Create a gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#121212');
      gradient.addColorStop(1, '#000000');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      
      // Draw FK logo with circle
      ctx.beginPath();
      ctx.arc(70, 70, 30, 0, Math.PI * 2, false);
      ctx.fillStyle = '#6752f9';
      ctx.fill();
      
      ctx.font = 'bold 24px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FK', 70, 70);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      
      // Draw the portfolio name - larger and bolder
      ctx.font = 'bold 38px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(portfolioName ? `${portfolioName} Portfolio` : 'Wallet Portfolio', 120, 80);
      
      // Draw date
      ctx.font = '18px Arial';
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'right';
      ctx.fillText(new Date().toLocaleDateString(), canvas.width - 40, 80);
      ctx.textAlign = 'left';
      
      // Draw the total value label
      ctx.font = '24px Arial';
      ctx.fillStyle = '#888888';
      ctx.fillText('Total Portfolio Value', 40, 160);
      
      // Draw the total value - much larger for emphasis
      ctx.font = 'bold 58px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(formatCurrency(wallet.totalValue || 0), 40, 230);
      
      // Draw divider line
      ctx.beginPath();
      ctx.moveTo(40, 270);
      ctx.lineTo(canvas.width - 40, 270);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw HEX stakes if available
      let startY = 320;
      if (hexStakesSummary && hexStakesSummary.stakeCount > 0) {
        // Draw circle for HEX logo
        ctx.beginPath();
        ctx.arc(65, startY, 25, 0, Math.PI * 2, false);
        ctx.fillStyle = '#9d4cff';
        ctx.fill();
        
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HEX', 65, startY);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        
        // Draw HEX stakes text - larger
        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('HEX Stakes', 110, startY + 10);
        
        // Draw HEX value - larger
        ctx.font = '28px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(hexStakesSummary.totalCombinedValueUsd || 0), canvas.width - 40, startY + 10);
        ctx.textAlign = 'left';
        
        // Draw HEX details
        ctx.font = '20px Arial';
        ctx.fillStyle = '#888888';
        ctx.fillText(
          `${formatTokenAmount(parseFloat(hexStakesSummary.totalCombinedHex || '0'))} HEX | ${hexStakesSummary.stakeCount} active stake${hexStakesSummary.stakeCount !== 1 ? 's' : ''}`, 
          110, 
          startY + 50
        );
        
        startY += 90; // More spacing
      }
      
      // Draw top 5 tokens section title - larger
      ctx.font = 'bold 30px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('Top 5 Holdings', 40, startY);
      startY += 60; // More spacing
      
      // Draw tokens with larger text and consistent circle logos
      top5Tokens.forEach((token, i) => {
        // Draw circle for token logo
        ctx.beginPath();
        ctx.arc(65, startY, 25, 0, Math.PI * 2, false);
        ctx.fillStyle = getColorFromString(token.symbol);
        ctx.fill();
        
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(token.symbol.slice(0, 3), 65, startY);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        
        // Draw token symbol - larger
        ctx.font = 'bold 30px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(token.symbol, 110, startY + 10);
        
        // Draw token value - larger
        ctx.font = '28px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(token.value || 0), canvas.width - 40, startY + 10);
        ctx.textAlign = 'left';
        
        // Draw token balance
        ctx.font = '20px Arial';
        ctx.fillStyle = '#888888';
        ctx.fillText(formatTokenAmount(token.balanceFormatted || 0), 110, startY + 50);
        
        // Add price change if available
        if (token.priceChange24h !== undefined) {
          ctx.fillStyle = token.priceChange24h > 0 ? '#4ade80' : '#ef4444';
          ctx.textAlign = 'right';
          ctx.fillText(
            `${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%`, 
            canvas.width - 40, 
            startY + 50
          );
          ctx.textAlign = 'left';
        }
        
        startY += 80; // More spacing between tokens
      });
      
      // Draw footer
      const footerY = canvas.height - 40;
      ctx.beginPath();
      ctx.moveTo(40, footerY - 40);
      ctx.lineTo(canvas.width - 40, footerY - 40);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Draw FrenKabal text
      ctx.font = '22px Arial';
      ctx.fillStyle = '#888888';
      ctx.fillText('Generated by FrenKabal', 40, footerY);
      
      // Draw circle for PLS logo
      ctx.beginPath();
      ctx.arc(canvas.width - 120, footerY, 20, 0, Math.PI * 2, false);
      ctx.fillStyle = '#e93578';
      ctx.fill();
      
      ctx.font = 'bold 16px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PLS', canvas.width - 120, footerY);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      
      // Draw PulseChain text
      ctx.font = 'bold 22px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'right';
      ctx.fillText('PulseChain', canvas.width - 150, footerY);
      ctx.textAlign = 'left';
      
      // Convert to blob and download
      canvas.toBlob((blob) => {
        if (blob) {
          saveAs(blob, `${portfolioName || 'wallet'}-portfolio.png`);
          toast({
            title: "Image downloaded",
            description: "Your portfolio image has been downloaded successfully.",
          });
        } else {
          throw new Error("Failed to create image blob");
        }
      }, 'image/png');
      
    } catch (error) {
      console.error('Error generating image:', error);
      toast({
        title: "Download failed",
        description: "Could not generate the image. Try again or use the Twitter share option instead.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingImage(false);
    }
  };
  
  // Helper function to generate a consistent color from a string
  const getColorFromString = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 60%)`;
  };

  // Share on Twitter - text only, no image upload
  const handleTwitterShare = () => {
    try {
      // Create a text for the tweet
      let tweetText = `Check out my ${portfolioName ? portfolioName + ' ' : ''}PulseChain portfolio worth ${formatCurrency(wallet.totalValue || 0)}`;
      
      // Add HEX stakes info if available
      if (hexStakesSummary && hexStakesSummary.stakeCount > 0) {
        tweetText += ` including ${formatCurrency(hexStakesSummary.totalCombinedValueUsd || 0)} in HEX stakes`;
      }
      
      tweetText += ` via @FrenKabal!`;
      
      // Use Twitter's intent URL system for text-only sharing
      const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent('https://frenkabal.replit.app/')}`;
      
      // Open Twitter in a new window
      window.open(twitterIntentUrl, '_blank');
    } catch (error) {
      console.error('Error sharing to Twitter:', error);
      toast({
        title: "Twitter share failed",
        description: "Could not open Twitter share dialog. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  return (
    <div className="mt-4 mb-4">
      {/* The card that will be captured for the share image */}
      <Card 
        ref={cardRef} 
        className="p-4 glass-card border-white/15 bg-gradient-to-br from-black/80 to-black/40 backdrop-blur-xl"
        style={{ width: '600px', maxWidth: '100%' }}
      >
        {/* Header - Logo and Title */}
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center">
            <img src={frenkabalLogo} alt="FrenKabal Logo" className="h-8 mr-2" />
            <h2 className="text-xl font-bold text-white">
              {portfolioName ? `${portfolioName} Portfolio` : 'Wallet Portfolio'}
            </h2>
          </div>
          <div className="text-sm text-gray-400">
            {new Date().toLocaleDateString()}
          </div>
        </div>
        
        {/* Total Value */}
        <div className="mb-3">
          <div className="text-sm text-gray-400">Total Portfolio Value</div>
          <div className="text-3xl font-bold text-white">
            {formatCurrency(wallet.totalValue || 0)}
          </div>
        </div>
        
        {/* HEX Stakes as a regular token entry if available */}
        {hexStakesSummary && hexStakesSummary.stakeCount > 0 && (
          <div className="mb-2">
            <div className="flex justify-between items-center py-1">
              <div className="flex items-center">
                <TokenLogo 
                  address="0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39" /* HEX token address */
                  symbol="HEX"
                  size="sm"
                />
                <div className="ml-2">
                  <div className="text-white font-medium leading-tight">
                    HEX Stakes
                  </div>
                  <div className="text-sm text-gray-400 leading-tight">
                    {formatTokenAmount(parseFloat(hexStakesSummary.totalCombinedHex || '0'))} HEX
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-white font-bold leading-tight">
                  {formatCurrency(hexStakesSummary.totalCombinedValueUsd || 0)}
                </div>
                <div className="text-xs text-gray-400 leading-tight">
                  {hexStakesSummary.stakeCount} active stake{hexStakesSummary.stakeCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Top 5 Holdings */}
        <div>
          <div className="text-sm text-gray-400 mb-1">Top 5 Holdings</div>
          <div className="space-y-2">
            {top5Tokens.map((token, index) => (
              <div key={`share-${token.address}-${index}`} className="flex justify-between items-center py-1">
                <div className="flex items-center">
                  <TokenLogo 
                    address={token.address} 
                    symbol={token.symbol}
                    fallbackLogo={token.logo}
                    size="sm"
                  />
                  <div className="ml-2">
                    <div className="text-white font-medium leading-tight">
                      {token.symbol}
                    </div>
                    <div className="text-sm text-gray-400 leading-tight">
                      {formatTokenAmount(token.balanceFormatted || 0)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold leading-tight">
                    {formatCurrency(token.value || 0)}
                  </div>
                  <div className={`text-xs leading-tight ${token.priceChange24h && token.priceChange24h > 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {token.priceChange24h !== undefined ? 
                      `${token.priceChange24h > 0 ? '+' : ''}${token.priceChange24h.toFixed(1)}%` : 
                      ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Footer */}
        <div className="mt-3 pt-2 border-t border-white/10 flex justify-between items-center">
          <div className="text-xs text-gray-400">
            Generated by FrenKabal
          </div>
          <div className="flex items-center">
            <img src={plsLogo} alt="PulseChain" className="h-5" />
            <span className="ml-1 text-sm text-white font-medium">PulseChain</span>
          </div>
        </div>
      </Card>
      
      {/* Buttons for downloading and sharing */}
      <div className="flex gap-2 mt-4">
        <Button
          onClick={handleDownloadImage}
          disabled={isGeneratingImage}
          className="flex items-center gap-2 glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white"
        >
          {isGeneratingImage ? (
            <>
              <span className="animate-spin h-4 w-4 border-2 border-white/50 border-t-white rounded-full mr-2"></span>
              Generating...
            </>
          ) : (
            <>
              <Download size={16} />
              Download Image
            </>
          )}
        </Button>
        
        <Button
          onClick={handleTwitterShare}
          className="flex items-center gap-2 glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white"
        >
          <Twitter size={16} />
          Share on Twitter
        </Button>
      </div>
    </div>
  );
}