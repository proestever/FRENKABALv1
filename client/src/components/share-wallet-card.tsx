import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatTokenAmount } from '@/lib/utils';
import { TokenLogo } from '@/components/token-logo';
import { Wallet } from '@shared/schema';
import { ProcessedToken } from 'server/types';
import { Share2, Download, Twitter, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toPng, toCanvas } from 'html-to-image';
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
  
  // Generate share image and save using a simpler approach without loading external images
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    
    setIsGeneratingImage(true);
    
    try {
      // Create a canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const boundingRect = cardRef.current.getBoundingClientRect();
      
      // Set canvas size to match the card
      canvas.width = boundingRect.width;
      canvas.height = boundingRect.height;
      
      if (!ctx) {
        throw new Error("Could not get canvas context");
      }
      
      // Create a gradient background
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, 'rgba(15, 15, 20, 0.95)');
      gradient.addColorStop(1, 'rgba(30, 30, 45, 0.85)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, canvas.width, canvas.height);
      
      // Draw circle for logo placeholder
      ctx.beginPath();
      ctx.arc(30, 30, 15, 0, Math.PI * 2, false);
      ctx.fillStyle = '#6752f9';
      ctx.fill();
      
      // Draw "FK" text as logo placeholder
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FK', 30, 30);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      
      // Draw the portfolio name
      ctx.font = 'bold 22px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(portfolioName ? `${portfolioName} Portfolio` : 'Wallet Portfolio', 60, 35);
      
      // Draw date
      ctx.font = '14px Arial';
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'right';
      ctx.fillText(new Date().toLocaleDateString(), canvas.width - 20, 35);
      ctx.textAlign = 'left';
      
      // Draw the total value label
      ctx.font = '16px Arial';
      ctx.fillStyle = '#888888';
      ctx.fillText('Total Portfolio Value', 20, 80);
      
      // Draw the total value
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(formatCurrency(wallet.totalValue || 0), 20, 115);
      
      // Draw divider line
      ctx.beginPath();
      ctx.moveTo(20, 140);
      ctx.lineTo(canvas.width - 20, 140);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.stroke();
      
      // Draw HEX stakes if available
      let startY = 170;
      if (hexStakesSummary && hexStakesSummary.stakeCount > 0) {
        // Draw circle for HEX logo placeholder
        ctx.beginPath();
        ctx.arc(30, startY - 5, 12, 0, Math.PI * 2, false);
        ctx.fillStyle = '#9d4cff';
        ctx.fill();
        
        ctx.font = 'bold 10px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HEX', 30, startY - 5);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        
        ctx.font = 'bold 18px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('HEX Stakes', 55, startY);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(hexStakesSummary.totalCombinedValueUsd || 0), canvas.width - 20, startY);
        ctx.textAlign = 'left';
        
        ctx.font = '12px Arial';
        ctx.fillStyle = '#888888';
        ctx.fillText(`${formatTokenAmount(parseFloat(hexStakesSummary.totalCombinedHex || '0'))} HEX | ${hexStakesSummary.stakeCount} active stake${hexStakesSummary.stakeCount !== 1 ? 's' : ''}`, 55, startY + 20);
        
        startY += 50;
      }
      
      // Draw top 5 tokens section title
      ctx.font = '16px Arial';
      ctx.fillStyle = '#888888';
      ctx.fillText('Top 5 Holdings', 20, startY);
      startY += 30;
      
      // Draw tokens (simplified)
      top5Tokens.forEach((token, i) => {
        // Draw circle for token logo placeholder
        ctx.beginPath();
        ctx.arc(30, startY - 5, 12, 0, Math.PI * 2, false);
        ctx.fillStyle = getColorFromString(token.symbol);
        ctx.fill();
        
        ctx.font = 'bold 10px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(token.symbol.slice(0, 3), 30, startY - 5);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        
        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(token.symbol, 55, startY);
        
        ctx.font = '14px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(formatCurrency(token.value || 0), canvas.width - 20, startY);
        ctx.textAlign = 'left';
        
        ctx.font = '12px Arial';
        ctx.fillStyle = '#888888';
        ctx.fillText(formatTokenAmount(token.balanceFormatted || 0), 55, startY + 20);
        
        startY += 40;
      });
      
      // Draw footer
      const footerY = canvas.height - 25;
      ctx.beginPath();
      ctx.moveTo(20, footerY - 20);
      ctx.lineTo(canvas.width - 20, footerY - 20);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.stroke();
      
      ctx.font = '14px Arial';
      ctx.fillStyle = '#888888';
      ctx.fillText('Generated by FrenKabal', 20, footerY);
      
      ctx.beginPath();
      ctx.arc(canvas.width - 30, footerY - 5, 10, 0, Math.PI * 2, false);
      ctx.fillStyle = '#e93578';
      ctx.fill();
      
      ctx.font = 'bold 8px Arial';
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('PLS', canvas.width - 30, footerY - 5);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      
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

  // Share on Twitter
  const handleTwitterShare = async () => {
    if (!cardRef.current) return;
    
    // Create a text for the tweet
    let tweetText = `Check out my ${portfolioName ? portfolioName + ' ' : ''}PulseChain portfolio worth ${formatCurrency(wallet.totalValue || 0)}`;
    
    // Add HEX stakes info if available
    if (hexStakesSummary && hexStakesSummary.stakeCount > 0) {
      tweetText += ` including ${formatCurrency(hexStakesSummary.totalCombinedValueUsd || 0)} in HEX stakes`;
    }
    
    tweetText += ` via @FrenKabal!`;
    
    // We'll share without trying to include the image since that's causing errors
    // Just use Twitter's intent URL system to share the text
    const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent('https://frenkabal.replit.app/')}`;
    
    // Open Twitter in a new window
    window.open(twitterIntentUrl, '_blank');
  };
  
  return (
    <div className="mt-4 mb-4">
      {/* The card that will be captured for the share image */}
      <Card 
        ref={cardRef} 
        className="p-6 glass-card border-white/15 bg-gradient-to-br from-black/80 to-black/40 backdrop-blur-xl"
        style={{ width: '600px', maxWidth: '100%' }}
      >
        {/* Header - Logo and Title */}
        <div className="flex justify-between items-center mb-6">
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
        <div className="mb-6">
          <div className="text-sm text-gray-400 mb-1">Total Portfolio Value</div>
          <div className="text-3xl font-bold text-white">
            {formatCurrency(wallet.totalValue || 0)}
          </div>
        </div>
        
        {/* HEX Stakes as a regular token entry if available */}
        {hexStakesSummary && hexStakesSummary.stakeCount > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <TokenLogo 
                  address="0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39" /* HEX token address */
                  symbol="HEX"
                  size="sm"
                />
                <div className="ml-2">
                  <div className="text-white font-medium">
                    HEX Stakes
                  </div>
                  <div className="text-sm text-gray-400">
                    {formatTokenAmount(parseFloat(hexStakesSummary.totalCombinedHex || '0'))} HEX
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-white font-bold">
                  {formatCurrency(hexStakesSummary.totalCombinedValueUsd || 0)}
                </div>
                <div className="text-xs text-gray-400">
                  {hexStakesSummary.stakeCount} active stake{hexStakesSummary.stakeCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Top 5 Holdings */}
        <div>
          <div className="text-sm text-gray-400 mb-3">Top 5 Holdings</div>
          <div className="space-y-3">
            {top5Tokens.map((token, index) => (
              <div key={`share-${token.address}-${index}`} className="flex justify-between items-center">
                <div className="flex items-center">
                  <TokenLogo 
                    address={token.address} 
                    symbol={token.symbol}
                    fallbackLogo={token.logo}
                    size="sm"
                  />
                  <div className="ml-2">
                    <div className="text-white font-medium">
                      {token.symbol}
                    </div>
                    <div className="text-sm text-gray-400">
                      {formatTokenAmount(token.balanceFormatted || 0)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-white font-bold">
                    {formatCurrency(token.value || 0)}
                  </div>
                  <div className={`text-xs ${token.priceChange24h && token.priceChange24h > 0 ? 'text-green-500' : 'text-red-500'}`}>
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
        <div className="mt-6 pt-4 border-t border-white/10 flex justify-between items-center">
          <div className="text-xs text-gray-400">
            Generated by FrenKabal
          </div>
          <div className="flex items-center">
            <img src={plsLogo} alt="PulseChain" className="h-6" />
            <span className="ml-2 text-sm text-white font-medium">PulseChain</span>
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