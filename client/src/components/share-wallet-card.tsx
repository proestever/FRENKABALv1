import React, { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatTokenAmount } from '@/lib/utils';
import { TokenLogo } from '@/components/token-logo';
import { Wallet } from '@shared/schema';
import { ProcessedToken } from 'server/types';
import { Share2, Download, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toPng } from 'html-to-image';
import { saveAs } from 'file-saver';
import plsLogo from '../assets/pls-logo-optimized.png';
import frenkabalLogo from '../assets/frenklabal_logo.png';
import { HexStakeSummary } from '@/hooks/use-hex-stakes';

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

  // Generate share image and save
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    
    try {
      // Use a more robust configuration for image generation
      const dataUrl = await toPng(cardRef.current, { 
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#121212',
        style: {
          // Avoid trying to load external resources that might fail
          fontFamily: 'Arial, sans-serif',
        },
        // Skip problematic network resources
        filter: (node) => {
          // Filter out elements that might cause problems
          if (node.tagName === 'LINK' && 
              node.getAttribute('rel') === 'stylesheet' && 
              node.getAttribute('href')?.includes('fonts.googleapis.com')) {
            return false;
          }
          return true;
        },
        cacheBust: true,
      });
      
      // Create and trigger a download link
      const link = document.createElement('a');
      link.download = `${portfolioName || 'wallet'}-portfolio.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Error generating image:', error);
      // Fallback method if the primary method fails
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const boundingRect = cardRef.current.getBoundingClientRect();
        
        canvas.width = boundingRect.width;
        canvas.height = boundingRect.height;
        
        if (ctx) {
          ctx.fillStyle = '#121212';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Use a simpler image format as fallback
          canvas.toBlob((blob) => {
            if (blob) {
              saveAs(blob, `${portfolioName || 'wallet'}-portfolio.png`);
            }
          });
        }
      } catch (fallbackError) {
        console.error('Fallback image generation also failed:', fallbackError);
      }
    }
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
          className="flex items-center gap-2 glass-card border-white/15 bg-black/20 hover:bg-white/10 text-white"
        >
          <Download size={16} />
          Download Image
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